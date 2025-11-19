/**
 * Logger Utility
 * Beautiful console logging for backend operations
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  step: '→',
  bullet: '•',
  arrow: '▶',
  check: '✔',
  cross: '✘',
  star: '★',
  rocket: '🚀',
  fire: '🔥',
  tick: '✅',
  box: '📦',
  folder: '📁',
  file: '📄',
  gear: '⚙️',
  database: '💾',
  server: '🖥️',
  api: '🔌',
  user: '👤',
  money: '💰',
  chart: '📊',
  calendar: '📅',
  clock: '🕐',
  mail: '✉️',
  phone: '📞',
  location: '📍'
};

class Logger {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 0;
    this.indent = 0;
  }

  /**
   * Set total steps for progress tracking
   */
  setSteps(total) {
    this.totalSteps = total;
    this.currentStep = 0;
  }

  /**
   * Print a step header
   */
  step(message) {
    this.currentStep++;
    const progress = this.totalSteps > 0 ? `[${this.currentStep}/${this.totalSteps}]` : `[${this.currentStep}]`;
    console.log(`\n${colors.cyan}${colors.bright}╔═══════════════════════════════════════════════════════════════════╗${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}║ ${progress} ${icons.step} ${message.padEnd(60)}║${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}╚═══════════════════════════════════════════════════════════════════╝${colors.reset}`);
  }

  /**
   * Print success message
   */
  success(message, details = null) {
    const indent = '  '.repeat(this.indent);
    console.log(`${indent}${colors.green}${icons.tick} ${message}${colors.reset}`);
    if (details) {
      this._printDetails(details);
    }
  }

  /**
   * Print error message
   */
  error(message, details = null) {
    const indent = '  '.repeat(this.indent);
    console.log(`${indent}${colors.red}${icons.cross} ${message}${colors.reset}`);
    if (details) {
      this._printDetails(details, 'red');
    }
  }

  /**
   * Print warning message
   */
  warning(message, details = null) {
    const indent = '  '.repeat(this.indent);
    console.log(`${indent}${colors.yellow}${icons.warning} ${message}${colors.reset}`);
    if (details) {
      this._printDetails(details, 'yellow');
    }
  }

  /**
   * Print info message
   */
  info(message, details = null) {
    const indent = '  '.repeat(this.indent);
    console.log(`${indent}${colors.blue}${icons.info} ${message}${colors.reset}`);
    if (details) {
      this._printDetails(details);
    }
  }

  /**
   * Print detail line
   */
  detail(key, value, icon = icons.bullet) {
    const indent = '  '.repeat(this.indent + 1);
    console.log(`${indent}${colors.dim}${icon} ${key}:${colors.reset} ${colors.white}${value}${colors.reset}`);
  }

  /**
   * Print multiple details
   */
  details(obj, icon = icons.bullet) {
    Object.entries(obj).forEach(([key, value]) => {
      this.detail(key, value, icon);
    });
  }

  /**
   * Print a divider
   */
  divider(char = '─', length = 70) {
    console.log(`${colors.dim}${char.repeat(length)}${colors.reset}`);
  }

  /**
   * Print a section header
   */
  section(title) {
    console.log(`\n${colors.bright}${colors.bgBlue}${colors.white} ${title} ${colors.reset}\n`);
  }

  /**
   * Print a subsection header
   */
  subsection(title) {
    console.log(`\n${colors.bright}${colors.cyan}▸ ${title}${colors.reset}`);
  }

  /**
   * Increase indent level
   */
  increaseIndent() {
    this.indent++;
  }

  /**
   * Decrease indent level
   */
  decreaseIndent() {
    this.indent = Math.max(0, this.indent - 1);
  }

  /**
   * Print table
   */
  table(data, headers) {
    console.table(data, headers);
  }

  /**
   * Print operation result box
   */
  box(title, items, type = 'info') {
    const color = type === 'success' ? colors.green : type === 'error' ? colors.red : colors.cyan;
    const icon = type === 'success' ? icons.tick : type === 'error' ? icons.cross : icons.info;
    
    console.log(`\n${color}┌─ ${icon} ${title}${colors.reset}`);
    items.forEach(item => {
      console.log(`${color}│${colors.reset}  ${item}`);
    });
    console.log(`${color}└${'─'.repeat(title.length + 4)}${colors.reset}`);
  }

  /**
   * Print statistics box
   */
  stats(title, stats) {
    console.log(`\n${colors.cyan}${colors.bright}╔═ ${icons.chart} ${title}${colors.reset}`);
    Object.entries(stats).forEach(([key, value]) => {
      const formattedValue = typeof value === 'number' ? value.toLocaleString() : value;
      console.log(`${colors.cyan}║${colors.reset}  ${colors.dim}${key}:${colors.reset} ${colors.bright}${formattedValue}${colors.reset}`);
    });
    console.log(`${colors.cyan}╚${'═'.repeat(title.length + 6)}${colors.reset}`);
  }

  /**
   * Print progress bar
   */
  progress(current, total, message = '') {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * 30);
    const bar = '█'.repeat(filled) + '░'.repeat(30 - filled);
    process.stdout.write(`\r${colors.cyan}[${bar}] ${percentage}%${colors.reset} ${message}`);
    if (current === total) {
      console.log(); // New line when complete
    }
  }

  /**
   * Internal: Print details object
   */
  _printDetails(details, color = 'dim') {
    const indent = '  '.repeat(this.indent + 1);
    const c = colors[color] || colors.dim;
    
    if (typeof details === 'object' && !Array.isArray(details)) {
      Object.entries(details).forEach(([key, value]) => {
        console.log(`${indent}${c}${icons.bullet} ${key}: ${colors.reset}${value}`);
      });
    } else if (Array.isArray(details)) {
      details.forEach(item => {
        console.log(`${indent}${c}${icons.bullet} ${item}${colors.reset}`);
      });
    } else {
      console.log(`${indent}${c}${details}${colors.reset}`);
    }
  }

  /**
   * Clear console
   */
  clear() {
    console.clear();
  }

  /**
   * Print banner
   */
  banner(text, icon = icons.rocket) {
    const line = '═'.repeat(text.length + 6);
    console.log(`\n${colors.cyan}${colors.bright}╔${line}╗${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}║   ${icon} ${text}   ║${colors.reset}`);
    console.log(`${colors.cyan}${colors.bright}╚${line}╝${colors.reset}\n`);
  }

  /**
   * Print completion message
   */
  complete(message, duration = null) {
    const durationText = duration ? ` (${duration}ms)` : '';
    console.log(`\n${colors.green}${colors.bright}${icons.tick} ${message}${durationText}${colors.reset}\n`);
  }

  /**
   * Print failure message
   */
  fail(message, error = null) {
    console.log(`\n${colors.red}${colors.bright}${icons.cross} ${message}${colors.reset}`);
    if (error) {
      console.log(`${colors.red}${error.message}${colors.reset}`);
      if (error.stack) {
        console.log(`${colors.dim}${error.stack}${colors.reset}`);
      }
    }
    console.log();
  }
}

// Export singleton instance
const logger = new Logger();

export default logger;
export { colors, icons, Logger };
