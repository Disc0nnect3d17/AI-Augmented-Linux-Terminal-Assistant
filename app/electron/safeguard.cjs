// ── AREA 2: Safeguard Classifier ──────────────────────────────────────────
// Risk-tiered advisory model — answers RQ3: "how does the system flag risky output?"
// Classification is entirely deterministic regex matching — the AI model does NOT
// decide the risk level. Your code does, independently of the model's response.
// Three tiers: SAFE (no match), CAUTION (elevated privilege/network), DANGER (irreversible harm).

// Tier 3 — DANGER: commands that can cause irreversible system-wide damage
const DANGER_PATTERNS = [
  /rm\s+-rf/i,           // recursive forced deletion
  /rm\s+-fr/i,           // same, flags reversed
  /dd\s+if=/i,           // raw disk write — can overwrite entire drives
  /mkfs/i,               // formats a filesystem, destroying all data
  /:\(\)\{:|fork\s+bomb/i, // fork bomb — crashes the OS via process exhaustion
  /chmod\s+777/i,        // removes all access controls
  /chown\s+-R\s+.*\s+\//i, // recursive ownership change from root
  /mv\s+.*\s+\/dev\/null/i, // silently destroys files
  />\s*\/dev\/sda/i,     // writes directly to raw disk device
  /shutdown/i,           // powers off the system
  /reboot/i,             // reboots the system
  /iptables\s+-F/i,      // flushes all firewall rules — opens all ports
  /passwd\s+root/i,      // changes root password
  /userdel\s+-r/i,       // deletes a user and their home directory
];

// Tier 2 — CAUTION: elevated privileges, network activity, or piped remote execution
const CAUTION_PATTERNS = [
  /sudo/i,               // runs with superuser privileges
  /chmod/i,              // modifies file permissions
  /chown/i,              // modifies file ownership
  /nmap/i,               // network scanner — could be used offensively
  /netcat|nc\s+-/i,      // raw TCP/UDP tool — can open reverse shells
  /curl\s+.*\|\s*(bash|sh)/i, // downloads and immediately executes remote code
  /wget\s+.*\|\s*(bash|sh)/i, // same pattern via wget
  /iptables/i,           // modifies kernel firewall rules
  /ufw/i,                // manages firewall (Uncomplicated Firewall)
  /systemctl/i,          // controls system services and daemons
  /crontab/i,            // schedules persistent background tasks
  /ssh/i,                // remote shell access
  /scp/i,                // secure file copy over SSH
  /eval/i,               // executes arbitrary string as code — injection risk
];

// Scans the AI's own response text for imperative execution language —
// catches cases where the model tries to push the user to run something immediately
const DANGER_RESPONSE_PATTERNS = [
  /run\s+the\s+following\s+command/i,
  /execute\s+the\s+following/i,
  /type\s+the\s+following\s+command/i,
  /run\s+this\s+command\s+now/i,
  /immediately\s+execute/i,
];

// Classifies the user's input command against DANGER then CAUTION pattern lists.
// Sequential: DANGER is checked first — a command matching both gets the higher tier.
function classifyCommand(command) {
  if (!command) return { tier: 'SAFE' };

  for (const pattern of DANGER_PATTERNS) {
    if (pattern.test(command)) {
      return {
        tier: 'DANGER',
        message: 'This command can cause irreversible system damage. Review carefully before executing manually.'
      };
    }
  }

  for (const pattern of CAUTION_PATTERNS) {
    if (pattern.test(command)) {
      return {
        tier: 'CAUTION',
        message: 'This command involves elevated privileges or network activity. Ensure you understand the implications before proceeding.'
      };
    }
  }

  return { tier: 'SAFE' };
}

// Independently classifies the AI's response text — a safe command can still
// trigger CAUTION if the model's reply contains direct execution instructions.
function classifyResponse(responseText) {
  if (!responseText) return { tier: 'SAFE' };

  for (const pattern of DANGER_RESPONSE_PATTERNS) {
    if (pattern.test(responseText)) {
      return {
        tier: 'CAUTION',
        message: 'The AI response contains direct execution instructions. Always review and run commands manually.'
      };
    }
  }

  return { tier: 'SAFE' };
}

// Entry point called from main.cjs after every AI response.
// Runs both classifiers and returns whichever produced the higher-severity tier.
// The UI always shows the worst-case result — conservative by design.
function assessRisk(command, aiResponse) {
  const commandRisk = classifyCommand(command);
  const responseRisk = classifyResponse(
    aiResponse?.explanation + ' ' + aiResponse?.next_steps
  );

  // Numeric priority lets us compare tiers: SAFE=0, CAUTION=1, DANGER=2
  const tierPriority = { SAFE: 0, CAUTION: 1, DANGER: 2 };
  if (tierPriority[commandRisk.tier] >= tierPriority[responseRisk.tier]) {
    return commandRisk; // command risk is equal or worse — return it
  }
  return responseRisk; // AI response risk is worse — return it instead
}

module.exports = { assessRisk, classifyCommand, classifyResponse };
