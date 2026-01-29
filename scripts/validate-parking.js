[file name]: validate-parking.js
[file content begin]
#!/usr/bin/env node

/**
 * Parking Data Validator - Terintegrasi dengan locations-config.json
 * Validates, fixes, and reports on parking data statistics
 * Mengikuti pola coding dari fix-statistics.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Command line arguments parser
const args = require('minimist')(process.argv.slice(2), {
  string: ['mode', 'log-level', 'threshold'],
  number: ['max-backups'],
  boolean: ['dry-run', 'force', 'verbose', 'backup'],
  alias: {
    m: 'mode',
    t: 'threshold',
    b: 'max-backups',
    d: 'dry-run',
    f: 'force',
    v: 'verbose',
    l: 'log-level'
  },
  default: {
    mode: 'strict',
    'max-backups': 10,
    threshold: 85,
    'dry-run': false,
    force: false,
    verbose: false,
    backup: true,
    'log-level': 'info'
  }
});

class ParkingDataValidator {
  constructor(config = {}) {
    this.rootDir = path.join(__dirname, '..');
    this.config = {
      // File paths
      dataPath: path.resolve(this.rootDir, 'data/parkir-data.json'),
      configPath: path.resolve(this.rootDir, 'config/locations-config.json'),
      backupDir: path.resolve(this.rootDir, 'data/backups'),
      reportDir: path.resolve(this.rootDir, 'data/reports'),
      logDir: path.resolve(this.rootDir, 'data/logs'),
      
      // Validation settings
      allowedVehicleTypes: ['bus', 'mobil', 'motor'],
      
      // Merge with user config
      ...config,
      ...args
    };
    
    // Initialize state
    this.metrics = {
      startTime: Date.now(),
      locationsProcessed: 0,
      issuesFound: 0,
      warnings: 0,
      fixesApplied: 0,
      processingTime: 0
    };
    
    this.results = {
      totals: { bus: 0, mobil: 0, motor: 0, total: 0 },
      available: { bus: 0, mobil: 0, motor: 0, total: 0 },
      utilization: { bus: 0, mobil: 0, motor: 0, overall: 0 },
      issues: [],
      warnings: [],
      fixes: [],
      recommendations: []
    };
    
    // Load config data
    this.locationsConfig = this.loadLocationsConfig();
    
    // Ensure directories exist
    this.ensureDirectories();
    
    // Setup logger
    this.setupLogger();
  }

  /**
   * Load locations configuration
   */
  loadLocationsConfig() {
    try {
      if (fs.existsSync(this.config.configPath)) {
        const configData = JSON.parse(fs.readFileSync(this.config.configPath, 'utf8'));
        this.logger.info(`Loaded locations config: ${configData.locations.length} locations`);
        return configData;
      } else {
        this.logger.warn('Locations config not found');
        return { locations: [], total_capacity: {} };
      }
    } catch (error) {
      this.logger.error('Failed to load locations config:', error.message);
      return { locations: [], total_capacity: {} };
    }
  }

  /**
   * Ensure all required directories exist
   */
  ensureDirectories() {
    const dirs = [
      this.config.backupDir,
      this.config.reportDir,
      this.config.logDir,
      path.dirname(this.config.dataPath)
    ];
    
    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.info(`Created directory: ${dir}`);
      }
    });
  }

  /**
   * Setup logging system
   */
  setupLogger() {
    const logLevels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
    
    this.logLevel = logLevels[this.config['log-level']] || 2;
    
    this.logger = {
      error: (message, data) => this.log('error', message, data),
      warn: (message, data) => this.log('warn', message, data),
      info: (message, data) => this.log('info', message, data),
      debug: (message, data) => this.log('debug', message, data)
    };
  }

  /**
   * Log message with timestamp and level
   */
  log(level, message, data = null) {
    const logLevels = { error: 0, warn: 1, info: 2, debug: 3 };
    const currentLevel = logLevels[level];
    
    if (currentLevel <= this.logLevel) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...(data && { data })
      };
      
      // Console output with colors
      const colors = {
        ERROR: '\x1b[31m', // Red
        WARN: '\x1b[33m',  // Yellow
        INFO: '\x1b[36m',  // Cyan
        DEBUG: '\x1b[90m', // Gray
        RESET: '\x1b[0m'   // Reset
      };
      
      const color = colors[level.toUpperCase()] || '';
      console.log(`${color}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.RESET}`);
      
      if (data && this.config.verbose) {
        console.log(JSON.stringify(data, null, 2));
      }
      
      // File logging
      this.writeToLogFile(logEntry);
    }
  }

  /**
   * Write log entry to file
   */
  writeToLogFile(entry) {
    const logFile = path.join(this.config.logDir, `validation-${new Date().toISOString().split('T')[0]}.log`);
    const logLine = JSON.stringify(entry) + '\n';
    
    try {
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error('Failed to write log:', error.message);
    }
  }

  /**
   * Main validation process
   */
  async validate() {
    try {
      this.logger.info('Starting parking data validation');
      
      // Create backup
      if (this.config.backup) {
        await this.createBackup();
      }
      
      // Load and validate data
      const data = await this.loadData();
      
      // Process data
      await this.processData(data);
      
      // Generate reports
      const report = await this.generateReport(data);
      
      // Cleanup old files
      await this.cleanup();
      
      this.metrics.processingTime = Date.now() - this.metrics.startTime;
      
      this.logger.info(`Validation completed in ${this.metrics.processingTime}ms`);
      this.logger.info(`Processed ${this.metrics.locationsProcessed} locations`);
      this.logger.info(`Found ${this.metrics.issuesFound} issues, applied ${this.metrics.fixesApplied} fixes`);
      
      return {
        success: true,
        report,
        metrics: this.metrics,
        results: this.results
      };
      
    } catch (error) {
      this.logger.error('Validation failed', { error: error.message, stack: error.stack });
      
      return {
        success: false,
        error: error.message,
        metrics: this.metrics,
        results: this.results
      };
    }
  }

  /**
   * Create backup of current data
   */
  async createBackup() {
    if (this.config['dry-run']) {
      this.logger.info('Dry-run mode: Skipping backup');
      return;
    }
    
    if (!fs.existsSync(this.config.dataPath)) {
      throw new Error(`Data file not found: ${this.config.dataPath}`);
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.config.backupDir, `parkir-data-backup-${timestamp}.json`);
    
    try {
      const data = fs.readFileSync(this.config.dataPath, 'utf8');
      fs.writeFileSync(backupFile, data);
      
      this.logger.info(`Backup created: ${backupFile}`);
      
      // Add to results
      this.results.backup = {
        file: backupFile,
        timestamp,
        size: Buffer.byteLength(data, 'utf8')
      };
      
    } catch (error) {
      throw new Error(`Failed to create backup: ${error.message}`);
    }
  }

  /**
   * Load and validate data structure
   */
  async loadData() {
    this.logger.debug('Loading data file');
    
    try {
      const rawData = fs.readFileSync(this.config.dataPath, 'utf8');
      const data = JSON.parse(rawData);
      
      // Validate structure
      this.validateStructure(data);
      
      this.logger.info(`Data loaded: ${data.locations?.length || 0} locations`);
      
      return data;
      
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON format: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Validate data structure
   */
  validateStructure(data) {
    const errors = [];
    
    // Check for required fields
    if (!data.locations || !Array.isArray(data.locations)) {
      errors.push('Data must contain "locations" array');
    }
    
    if (!data.statistics || typeof data.statistics !== 'object') {
      errors.push('Data must contain "statistics" object');
    }
    
    // Validate each location
    if (data.locations && Array.isArray(data.locations)) {
      data.locations.forEach((location, index) => {
        if (!location.nama) {
          errors.push(`Location at index ${index} missing "nama"`);
        }
        
        this.config.allowedVehicleTypes.forEach(type => {
          if (!location[type]) {
            this.logger.warn(`Location "${location.nama}" missing "${type}" data`);
            location[type] = { total: 0, available: 0 };
          }
        });
      });
    }
    
    if (errors.length > 0) {
      throw new Error(`Data structure validation failed:\n${errors.join('\n')}`);
    }
  }

  /**
   * Process all locations and calculate statistics
   */
  async processData(data) {
    this.logger.info('Processing locations data');
    
    // Process in batches for large datasets
    const locations = data.locations;
    
    for (let i = 0; i < locations.length; i++) {
      this.metrics.locationsProcessed++;
      
      const location = locations[i];
      const locationIssues = [];
      const locationFixes = [];
      
      // Find matching config location
      const configLocation = this.locationsConfig.locations?.find(l => l.id === location.id);
      
      if (!configLocation) {
        locationIssues.push(`Location ID ${location.id} not found in config`);
        this.metrics.issuesFound++;
      }
      
      // Process each vehicle type
      for (const vehicleType of this.config.allowedVehicleTypes) {
        const result = this.processVehicleType(location, vehicleType, configLocation);
        
        if (result.issues.length > 0) {
          locationIssues.push(...result.issues);
          this.metrics.issuesFound += result.issues.length;
        }
        
        if (result.fixes.length > 0) {
          locationFixes.push(...result.fixes);
          this.metrics.fixesApplied += result.fixes.length;
        }
        
        // Update running totals
        this.results.totals[vehicleType] += location[vehicleType].total;
        this.results.available[vehicleType] += location[vehicleType].available;
      }
      
      // Update location metadata
      location.lastValidated = new Date().toISOString();
      location.validationIssues = locationIssues.length;
      
      // Record issues and fixes
      if (locationIssues.length > 0) {
        this.results.issues.push({
          location: location.nama,
          issues: locationIssues
        });
      }
      
      if (locationFixes.length > 0) {
        this.results.fixes.push({
          location: location.nama,
          fixes: locationFixes
        });
      }
      
      // Add recommendations
      const recommendations = this.generateRecommendations(location);
      if (recommendations.length > 0) {
        this.results.recommendations.push({
          location: location.nama,
          recommendations
        });
      }
      
      // Check processing time
      if (Date.now() - this.metrics.startTime > 30000) { // 30 seconds timeout
        throw new Error('Processing timeout exceeded');
      }
    }
    
    // Update statistics
    this.updateStatistics(data);
    
    // Save changes if not in dry-run mode
    if (!this.config['dry-run']) {
      await this.saveData(data);
    }
  }

  /**
   * Process individual vehicle type data
   */
  processVehicleType(location, vehicleType, configLocation) {
    const result = { issues: [], fixes: [] };
    let vehicleData = location[vehicleType];
    
    // Ensure data structure
    if (!vehicleData || typeof vehicleData !== 'object') {
      vehicleData = { total: 0, available: 0 };
      location[vehicleType] = vehicleData;
      result.fixes.push(`Created missing ${vehicleType} data structure`);
    }
    
    // Parse and validate values
    const originalTotal = vehicleData.total;
    const originalAvailable = vehicleData.available;
    
    const total = this.parseNumber(vehicleData.total, 0);
    const available = this.parseNumber(vehicleData.available, 0);
    
    // Get config capacity if available
    const configCapacity = configLocation?.capacity?.[vehicleType]?.total || 0;
    
    // Apply validation rules
    if (configCapacity > 0 && total !== configCapacity) {
      result.issues.push(`${vehicleType}: Total capacity (${total}) doesn't match config (${configCapacity})`);
      if (this.config.force || this.config.mode === 'fix') {
        vehicleData.total = configCapacity;
        result.fixes.push(`Fixed ${vehicleType} total capacity to config value: ${configCapacity}`);
      }
    }
    
    if (available < 0) {
      result.issues.push(`${vehicleType}: Negative available spaces (${available})`);
      vehicleData.available = 0;
      result.fixes.push(`Fixed negative available spaces to 0`);
    }
    
    if (available > total) {
      result.issues.push(`${vehicleType}: Available (${available}) exceeds total (${total})`);
      vehicleData.available = total;
      result.fixes.push(`Fixed available spaces to match total: ${total}`);
    }
    
    // Update with validated values
    vehicleData.total = vehicleData.total || total;
    vehicleData.available = vehicleData.available || Math.min(available, vehicleData.total);
    
    // Check if values were changed
    if (originalTotal !== vehicleData.total || originalAvailable !== vehicleData.available) {
      result.fixes.push(`Updated ${vehicleType}: ${originalTotal}→${vehicleData.total}, ${originalAvailable}→${vehicleData.available}`);
    }
    
    return result;
  }

  /**
   * Safe number parsing
   */
  parseNumber(value, defaultValue = 0) {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    
    const num = Number(value);
    
    if (isNaN(num)) {
      this.logger.warn(`Invalid number value: ${value}, using default: ${defaultValue}`);
      return defaultValue;
    }
    
    // Round to nearest integer for parking spaces
    return Math.max(0, Math.round(num));
  }

  /**
   * Generate recommendations for a location
   */
  generateRecommendations(location) {
    const recommendations = [];
    const configLocation = this.locationsConfig.locations?.find(l => l.id === location.id);
    
    if (!configLocation) {
      recommendations.push('Location not found in config - consider updating config file');
      return recommendations;
    }
    
    this.config.allowedVehicleTypes.forEach(type => {
      const data = location[type];
      const configCapacity = configLocation.capacity?.[type]?.total || 0;
      
      if (configCapacity > 0 && data.total === 0) {
        recommendations.push(`${type}: Missing capacity data (config: ${configCapacity})`);
      }
      
      if (data.total > 0) {
        const utilization = ((data.total - data.available) / data.total) * 100;
        
        if (utilization >= 95) {
          recommendations.push(`${type}: Critical utilization (${utilization.toFixed(1)}%) - Consider adding capacity`);
        } else if (utilization >= 80) {
          recommendations.push(`${type}: High utilization (${utilization.toFixed(1)}%) - Monitor closely`);
        }
      }
    });
    
    return recommendations;
  }

  /**
   * Update global statistics
   */
  updateStatistics(data) {
    // Calculate totals
    this.results.totals.total = Object.values(this.results.totals).reduce((a, b) => a + b, 0);
    this.results.available.total = Object.values(this.results.available).reduce((a, b) => a + b, 0);
    
    // Calculate utilization percentages
    this.config.allowedVehicleTypes.forEach(type => {
      if (this.results.totals[type] > 0) {
        this.results.utilization[type] = 
          ((this.results.totals[type] - this.results.available[type]) / this.results.totals[type]) * 100;
      }
    });
    
    if (this.results.totals.total > 0) {
      this.results.utilization.overall = 
        ((this.results.totals.total - this.results.available.total) / this.results.totals.total) * 100;
    }
    
    // Compare with config totals
    const configTotals = this.locationsConfig.total_capacity || {};
    let configConsistency = true;
    
    this.config.allowedVehicleTypes.forEach(type => {
      const configTotal = configTotals[type] || 0;
      const dataTotal = this.results.totals[type] || 0;
      
      if (configTotal > 0 && Math.abs(configTotal - dataTotal) > 5) { // Allow 5 unit difference
        this.logger.warn(`${type} capacity mismatch: config=${configTotal}, data=${dataTotal}`);
        configConsistency = false;
      }
    });
    
    // Update data statistics
    data.statistics = {
      // Capacity data
      total_bus_capacity: this.results.totals.bus,
      total_mobil_capacity: this.results.totals.mobil,
      total_motor_capacity: this.results.totals.motor,
      
      // Availability data
      total_available_bus: this.results.available.bus,
      total_available_mobil: this.results.available.mobil,
      total_available_motor: this.results.available.motor,
      
      // Utilization data
      utilization_bus: this.results.utilization.bus.toFixed(1),
      utilization_mobil: this.results.utilization.mobil.toFixed(1),
      utilization_motor: this.results.utilization.motor.toFixed(1),
      utilization_overall: this.results.utilization.overall.toFixed(1),
      
      // Metadata
      last_recalculated: new Date().toISOString(),
      recalculated_by: 'validate-parking.js',
      config_consistency: configConsistency ? 'good' : 'warning',
      issues_found: this.metrics.issuesFound,
      fixes_applied: this.metrics.fixesApplied
    };
    
    // Update metadata
    data.metadata = data.metadata || {};
    data.metadata.last_validated = new Date().toISOString();
    data.metadata.validator_version = '2.0.0';
    data.metadata.validation_mode = this.config.mode;
    
    this.logger.info('Statistics updated successfully');
  }

  /**
   * Save processed data
   */
  async saveData(data) {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      fs.writeFileSync(this.config.dataPath, jsonString);
      
      this.logger.info(`Data saved to: ${this.config.dataPath}`);
      this.logger.debug(`File size: ${Buffer.byteLength(jsonString, 'utf8')} bytes`);
      
      // Try to commit changes if in git repository
      this.tryGitCommit();
      
    } catch (error) {
      throw new Error(`Failed to save data: ${error.message}`);
    }
  }

  /**
   * Try to commit changes to git
   */
  tryGitCommit() {
    try {
      execSync('git add data/parkir-data.json', { cwd: this.rootDir });
      execSync('git commit -m "✅ Auto-validate parking data"', { cwd: this.rootDir });
      this.logger.info('💾 Changes committed to git');
    } catch (gitError) {
      this.logger.info('ℹ️ Git commit skipped (not a git repo or no changes)');
    }
  }

  /**
   * Generate comprehensive report
   */
  async generateReport(data) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total_locations: data.locations.length,
        total_capacity: this.results.totals.total,
        total_available: this.results.available.total,
        utilization_percent: this.results.utilization.overall.toFixed(1),
        issues_found: this.metrics.issuesFound,
        fixes_applied: this.metrics.fixesApplied,
        processing_time_ms: this.metrics.processingTime,
        config_consistency: data.statistics?.config_consistency || 'unknown'
      },
      
      details: {
        by_vehicle_type: this.config.allowedVehicleTypes.reduce((acc, type) => {
          acc[type] = {
            capacity: this.results.totals[type],
            available: this.results.available[type],
            utilization: this.results.utilization[type].toFixed(1)
          };
          return acc;
        }, {}),
        
        config_comparison: this.config.allowedVehicleTypes.reduce((acc, type) => {
          const configTotal = this.locationsConfig.total_capacity?.[type] || 0;
          const dataTotal = this.results.totals[type] || 0;
          acc[type] = {
            config: configTotal,
            data: dataTotal,
            difference: dataTotal - configTotal,
            status: configTotal > 0 && Math.abs(dataTotal - configTotal) <= 5 ? 'match' : 'mismatch'
          };
          return acc;
        }, {}),
        
        issues_by_severity: {
          critical: this.results.issues.filter(i => 
            i.issues.some(issue => issue.includes('Critical') || issue.includes('exceeds'))
          ).length,
          warning: this.results.issues.filter(i => 
            i.issues.some(issue => issue.includes('Warning') || issue.includes('mismatch'))
          ).length,
          info: this.results.issues.length
        }
      },
      
      issues_fixed: this.results.fixes,
      recommendations: this.results.recommendations,
      
      metadata: {
        validator_version: '2.0.0',
        config: {
          mode: this.config.mode,
          max_backups: this.config['max-backups'],
          threshold: this.config.threshold
        },
        git_info: this.getGitInfo(),
        system_info: {
          node_version: process.version,
          platform: process.platform,
          memory_usage: process.memoryUsage()
        }
      }
    };
    
    // Save report to file
    const reportFile = path.join(this.config.reportDir, `validation-report-${new Date().toISOString().split('T')[0]}.json`);
    const latestReport = path.join(this.config.reportDir, 'validation-report-latest.json');
    
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    fs.writeFileSync(latestReport, JSON.stringify(report, null, 2));
    
    this.logger.info(`Report generated: ${reportFile}`);
    
    // Generate human-readable summary
    await this.generateTextSummary(report);
    
    return report;
  }

  /**
   * Get Git repository information
   */
  getGitInfo() {
    try {
      return {
        branch: execSync('git branch --show-current', { encoding: 'utf8', cwd: this.rootDir }).trim(),
        commit: execSync('git rev-parse HEAD', { encoding: 'utf8', cwd: this.rootDir }).trim(),
        commit_short: execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: this.rootDir }).trim(),
        last_commit_message: execSync('git log -1 --pretty=%B', { encoding: 'utf8', cwd: this.rootDir }).trim()
      };
    } catch (error) {
      return { error: 'Git information unavailable' };
    }
  }

  /**
   * Generate human-readable text summary
   */
  async generateTextSummary(report) {
    const summaryFile = path.join(this.config.reportDir, 'validation-summary.txt');
    
    const summary = `
PARKING DATA VALIDATION SUMMARY
================================
Generated: ${new Date(report.timestamp).toLocaleString()}

OVERVIEW
--------
• Total Locations: ${report.summary.total_locations}
• Total Capacity: ${report.summary.total_capacity} spaces
• Available Spaces: ${report.summary.total_available}
• Utilization Rate: ${report.summary.utilization_percent}%
• Processing Time: ${report.summary.processing_time_ms}ms
• Issues Found: ${report.summary.issues_found}
• Fixes Applied: ${report.summary.fixes_applied}
• Config Consistency: ${report.summary.config_consistency}

BY VEHICLE TYPE
---------------
${this.config.allowedVehicleTypes.map(type => {
  const details = report.details.by_vehicle_type[type];
  const configComp = report.details.config_comparison[type];
  const statusIcon = configComp.status === 'match' ? '✅' : '⚠️';
  return `• ${statusIcon} ${type.toUpperCase()}: ${details.available}/${details.capacity} available (${details.utilization}% utilized) [Config: ${configComp.config}]`;
}).join('\n')}

CONFIG COMPARISON
-----------------
${this.config.allowedVehicleTypes.map(type => {
  const comp = report.details.config_comparison[type];
  if (comp.config === 0) return null;
  const diff = comp.difference;
  const diffText = diff > 0 ? `+${diff}` : diff.toString();
  const status = comp.status === 'match' ? '✅ Match' : `⚠️ Mismatch (${diffText})`;
  return `• ${type.toUpperCase()}: ${status}`;
}).filter(line => line !== null).join('\n')}

ISSUES SUMMARY
--------------
• Critical: ${report.details.issues_by_severity.critical}
• Warning: ${report.details.issues_by_severity.warning}
• Info: ${report.details.issues_by_severity.info}

RECOMMENDATIONS
---------------
${report.recommendations.length > 0 ? 
  report.recommendations.map(rec => 
    `• ${rec.location}: ${rec.recommendations.join(', ')}`
  ).join('\n') : 
  'No recommendations at this time.'}

VALIDATION CONFIG
-----------------
• Mode: ${report.metadata.config.mode}
• Threshold: ${report.metadata.config.threshold}%
• Max Backups: ${report.metadata.config.max_backups}

================================
Validation completed ${report.summary.issues_found > 0 ? 'with issues' : 'successfully'}
    `;
    
    fs.writeFileSync(summaryFile, summary.trim());
    this.logger.info(`Text summary generated: ${summaryFile}`);
  }

  /**
   * Cleanup old backup and report files
   */
  async cleanup() {
    if (this.config['dry-run']) {
      return;
    }
    
    try {
      // Cleanup old backups
      const maxBackups = this.config['max-backups'];
      const backupFiles = fs.readdirSync(this.config.backupDir)
        .filter(file => file.startsWith('parkir-data-backup-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.config.backupDir, file),
          time: fs.statSync(path.join(this.config.backupDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);
      
      if (backupFiles.length > maxBackups) {
        const toDelete = backupFiles.slice(maxBackups);
        toDelete.forEach(file => {
          fs.unlinkSync(file.path);
          this.logger.debug(`Removed old backup: ${file.name}`);
        });
      }
      
      // Cleanup old reports (keep last 30 days)
      const reportFiles = fs.readdirSync(this.config.reportDir)
        .filter(file => file.startsWith('validation-report-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.config.reportDir, file),
          time: fs.statSync(path.join(this.config.reportDir, file)).mtime.getTime()
        }));
      
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const oldReports = reportFiles.filter(file => file.time < thirtyDaysAgo);
      
      oldReports.forEach(file => {
        if (file.name !== 'validation-report-latest.json') {
          fs.unlinkSync(file.path);
          this.logger.debug(`Removed old report: ${file.name}`);
        }
      });
      
    } catch (error) {
      this.logger.warn('Cleanup failed', { error: error.message });
    }
  }

  /**
   * Print final report to console
   */
  printConsoleReport(report) {
    console.log('\n' + '='.repeat(80));
    console.log('🎯 PARKING DATA VALIDATION - FINAL REPORT');
    console.log('='.repeat(80));
    
    console.log(`\n📊 SUMMARY`);
    console.log(`   Locations: ${report.summary.total_locations}`);
    console.log(`   Total Capacity: ${report.summary.total_capacity}`);
    console.log(`   Available: ${report.summary.total_available}`);
    console.log(`   Utilization: ${report.summary.utilization_percent}%`);
    console.log(`   Issues Fixed: ${report.summary.fixes_applied}`);
    console.log(`   Config Consistency: ${report.summary.config_consistency}`);
    
    console.log(`\n🚗 VEHICLE BREAKDOWN`);
    this.config.allowedVehicleTypes.forEach(type => {
      const details = report.details.by_vehicle_type[type];
      const configComp = report.details.config_comparison[type];
      const icon = details.utilization >= 90 ? '🔴' : details.utilization >= 70 ? '🟡' : '🟢';
      const configIcon = configComp.status === 'match' ? '✅' : '⚠️';
      console.log(`   ${icon} ${configIcon} ${type.toUpperCase()}: ${details.available}/${details.capacity} (${details.utilization}%)`);
    });
    
    if (report.recommendations.length > 0) {
      console.log(`\n💡 RECOMMENDATIONS`);
      report.recommendations.forEach(rec => {
        console.log(`   • ${rec.location}: ${rec.recommendations.join(', ')}`);
      });
    }
    
    console.log('\n' + '='.repeat(80));
    console.log(`✅ Validation completed at ${new Date().toLocaleTimeString()}`);
    console.log('='.repeat(80) + '\n');
  }
  
  /**
   * Quick validation mode (for emergency)
   */
  async quickValidate() {
    this.logger.info('🚀 Running quick validation...');
    
    try {
      const data = JSON.parse(fs.readFileSync(this.config.dataPath, 'utf8'));
      
      // Just check basic structure and config consistency
      const issues = [];
      let totalCapacity = { bus: 0, mobil: 0, motor: 0 };
      
      data.locations.forEach(location => {
        this.config.allowedVehicleTypes.forEach(type => {
          const capacity = location[type]?.total || 0;
          totalCapacity[type] += capacity;
        });
      });
      
      // Compare with config
      if (this.locationsConfig.total_capacity) {
        this.config.allowedVehicleTypes.forEach(type => {
          const configTotal = this.locationsConfig.total_capacity[type] || 0;
          const dataTotal = totalCapacity[type] || 0;
          
          if (configTotal > 0 && Math.abs(configTotal - dataTotal) > 10) {
            issues.push(`${type} capacity mismatch: config=${configTotal}, data=${dataTotal}`);
          }
        });
      }
      
      if (issues.length > 0) {
        console.log('⚠️ Quick validation found issues:');
        issues.forEach(issue => console.log(`   - ${issue}`));
      } else {
        console.log('✅ Quick validation passed');
      }
      
      return {
        success: true,
        issues: issues.length,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Quick validation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Main execution
(async () => {
  try {
    const validator = new ParkingDataValidator();
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    if (args.includes('--quick')) {
      await validator.quickValidate();
      process.exit(0);
    } else {
      const result = await validator.validate();
      
      if (result.success) {
        validator.printConsoleReport(result.report);
        process.exit(0);
      } else {
        console.error('\n❌ Validation failed:', result.error);
        process.exit(1);
      }
    }
    
  } catch (error) {
    console.error('\n💥 Unexpected error:', error);
    process.exit(1);
  }
})();

module.exports = ParkingDataValidator;
[file content end]
