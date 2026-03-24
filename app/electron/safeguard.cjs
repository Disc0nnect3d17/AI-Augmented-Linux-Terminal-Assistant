// safeguard.cjs — Risk-tiered advisory model
// Classifies commands and AI responses into three tiers:
// SAFE, CAUTION, DANGER

const DANGER_PATTERNS = [
  /rm\s+-rf/i,
  /rm\s+-fr/i,
  /dd\s+if=/i,
  /mkfs/i,
  /:\(\)\{:|fork\s+bomb/i,
  /chmod\s+777/i,
  /chown\s+-R\s+.*\s+\//i,
  /mv\s+.*\s+\/dev\/null/i,
  />\s*\/dev\/sda/i,
  /shutdown/i,
  /reboot/i,
  /iptables\s+-F/i,
  /passwd\s+root/i,
  /userdel\s+-r/i,
];

const CAUTION_PATTERNS = [
  /sudo/i,
  /chmod/i,
  /chown/i,
  /nmap/i,
  /netcat|nc\s+-/i,
  /curl\s+.*\|\s*(bash|sh)/i,
  /wget\s+.*\|\s*(bash|sh)/i,
  /iptables/i,
  /ufw/i,
  /systemctl/i,
  /crontab/i,
  /ssh/i,
  /scp/i,
  /eval/i,
];

const DANGER_RESPONSE_PATTERNS = [
  /run\s+the\s+following\s+command/i,
  /execute\s+the\s+following/i,
  /type\s+the\s+following\s+command/i,
  /run\s+this\s+command\s+now/i,
  /immediately\s+execute/i,
];

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

function assessRisk(command, aiResponse) {
  const commandRisk = classifyCommand(command);
  const responseRisk = classifyResponse(
    aiResponse?.explanation + ' ' + aiResponse?.next_steps
  );

  // Take the highest tier between command and response
  const tierPriority = { SAFE: 0, CAUTION: 1, DANGER: 2 };
  if (tierPriority[commandRisk.tier] >= tierPriority[responseRisk.tier]) {
    return commandRisk;
  }
  return responseRisk;
}

module.exports = { assessRisk, classifyCommand, classifyResponse };
