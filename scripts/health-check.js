#!/usr/bin/env node
/**
 * Health check script untuk monitoring kesehatan sistem parkir
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

class SystemHealthChecker {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.checks = [];
    this.results = {
      timestamp: new Date().toISOString(),
      overall_status: 'unknown',
      checks_passed: 0,
      checks_failed: 0,
      checks_warning: 0,
      details: []
    };
  }

  /**
   * Tambahkan check ke dalam queue
   */
  addCheck(name, checkFunction, critical = false) {
    this.checks.push({
      name,
      checkFunction,
      critical,
      status: 'pending'
    });
  }

  /**
   * Check: File konfigurasi
   */
  checkConfigFiles() {
    const requiredConfigs = [
      'config/locations-config.json',
      'config/notifications.json',
      'config/system-settings.json',
      'config/vehicle-types.json'
    ];

    const missing = [];
    const corrupted = [];

    requiredConfigs.forEach(config => {
      const filePath = path.join(this.rootDir, config);
      
      if (!fs.existsSync(filePath)) {
        missing.push(config);
      } else {
        try {
          JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (error) {
          corrupted.push(`${config} (${error.message})`);
        }
      }
    });

    return {
      passed: missing.length === 0 && corrupted.length === 0,
      details: {
        total: requiredConfigs.length,
        missing,
        corrupted,
        present: requiredConfigs.length - missing.length - corrupted.length
      }
    };
  }

  /**
   * Check: File data
   */
  checkDataFiles() {
    const requiredData = [
      'data/parkir-data.json',
      'data/pending-updates.json'
    ];

    const optionalData = [
      'data/backups/',
      'data/logs/',
      'data/reports/',
      'data/updates/archive/'
    ];

    const results = {
      required: {
        missing: [],
        corrupted: [],
        valid: []
      },
      optional: {
        missing: [],
        valid: []
      }
    };

    // Check required files
    requiredData.forEach(file => {
      const filePath = path.join(this.rootDir, file);
      
      if (!fs.existsSync(filePath)) {
        results.required.missing.push(file);
      } else {
        try {
          JSON.parse(fs.readFileSync(filePath, 'utf8'));
          results.required.valid.push(file);
        } catch (error) {
          results.required.corrupted.push(`${file} (${error.message})`);
        }
      }
    });

    // Check optional directories
    optionalData.forEach(dir => {
      const dirPath = path.join(this.rootDir, dir);
      
      if (!fs.existsSync(dirPath)) {
        results.optional.missing.push(dir);
      } else {
        results.optional.valid.push(dir);
      }
    });

    return {
      passed: results.required.missing.length === 0 && 
              results.required.corrupted.length === 0,
      details: results
    };
  }

  /**
   * Check: GitHub repository
   */
  async checkGitHubConnection() {
    return new Promise((resolve) => {
      const options = {
        hostname: 'api.github.com',
        path: '/repos/satlantaspolrestayka/ops-ketupat-progo-2026',
        method: 'GET',
        headers: {
          'User-Agent': 'ParkingSystemHealthCheck'
        },
        timeout: 10000
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve({
              passed: true,
              details: {
                status_code: res.statusCode,
                repository_exists: true
              }
            });
          } else {
            resolve({
              passed: false,
              details: {
                status_code: res.statusCode,
                error: `HTTP ${res.statusCode}`
              }
            });
          }
        });
      });

      req.on('error', (error) => {
        resolve({
          passed: false,
          details: {
            error: error.message,
            connection_failed: true
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          passed: false,
          details: {
            error: 'Connection timeout',
            timeout: true
          }
        });
      });

      req.end();
    });
  }

  /**
   * Check: Data konsistensi
   */
  checkDataConsistency() {
    try {
      const dataPath = path.join(this.rootDir, 'data/parkir-data.json');
      const configPath = path.join(this.rootDir, 'config/locations-config.json');
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      const issues = [];

      // Check location count
      if (data.locations.length !== config.locations.length) {
        issues.push(`Location count mismatch: data=${data.locations.length}, config=${config.locations.length}`);
      }

      // Check statistics
      let calculatedBus = 0;
      let calculatedMobil = 0;
      let calculatedMotor = 0;

      data.locations.forEach(location => {
        calculatedBus += location.bus?.available || 0;
        calculatedMobil += location.mobil?.available || 0;
        calculatedMotor += location.motor?.available || 0;
      });

      if (calculatedBus !== data.statistics.total_available_bus) {
        issues.push(`Bus statistics mismatch: calculated=${calculatedBus}, reported=${data.statistics.total_available_bus}`);
      }

      if (calculatedMobil !== data.statistics.total_available_mobil) {
        issues.push(`Mobil statistics mismatch: calculated=${calculatedMobil}, reported=${data.statistics.total_available_mobil}`);
      }

      if (calculatedMotor !== data.statistics.total_available_motor) {
        issues.push(`Motor statistics mismatch: calculated=${calculatedMotor}, reported=${data.statistics.total_available_motor}`);
      }

      return {
        passed: issues.length === 0,
        details: {
          issues,
          total_locations: data.locations.length,
          statistics_consistent: issues.length === 0
        }
      };

    } catch (error) {
      return {
        passed: false,
        details: {
          error: error.message
        }
      };
    }
  }

  /**
   * Check: Backup kesehatan
   */
  checkBackupHealth() {
    try {
      const backupDir = path.join(this.rootDir, 'data/backups');
      
      if (!fs.existsSync(backupDir)) {
        return {
          passed: false,
          details: {
            error: 'Backup directory does not exist'
          }
        };
      }

      const backupFiles = fs.readdirSync(backupDir)
        .filter(file => file.includes('backup-compressed-') && file.endsWith('.json.gz'));

      const latestBackupFile = path.join(backupDir, 'latest-backup.json');
      const hasLatestBackup = fs.existsSync(latestBackupFile);

      // Check backup age
      let newestBackup = null;
      let oldestBackup = null;

      if (backupFiles.length > 0) {
        const backupTimes = backupFiles.map(file => {
          const match = file.match(/backup-compressed-(.+)\.json\.gz/);
          return match ? new Date(match[1].replace(/-/g, ':')) : null;
        }).filter(time => time !== null);

        if (backupTimes.length > 0) {
          newestBackup = Math.max(...backupTimes.map(t => t.getTime()));
          oldestBackup = Math.min(...backupTimes.map(t => t.getTime()));
        }
      }

      const newestBackupAge = newestBackup ? Date.now() - newestBackup : null;
      const oldestBackupAge = oldestBackup ? Date.now() - oldestBackup : null;

      const issues = [];
      const warnings = [];

      if (backupFiles.length === 0) {
        issues.push('No backup files found');
      }

      if (!hasLatestBackup) {
        warnings.push('No latest backup reference');
      }

      if (newestBackupAge && newestBackupAge > 24 * 60 * 60 * 1000) {
        warnings.push(`Newest backup is ${Math.round(newestBackupAge / (60 * 60 * 1000))} hours old`);
      }

      return {
        passed: issues.length === 0,
        details: {
          total_backups: backupFiles.length,
          has_latest_reference: hasLatestBackup,
          newest_backup_age_hours: newestBackupAge ? Math.round(newestBackupAge / (60 * 60 * 1000)) : null,
          oldest_backup_age_days: oldestBackupAge ? Math.round(oldestBackupAge / (24 * 60 * 60 * 1000)) : null,
          issues,
          warnings
        }
      };

    } catch (error) {
      return {
        passed: false,
        details: {
          error: error.message
        }
      };
    }
  }

  /**
   * Check: Log files
   */
  checkLogFiles() {
    try {
      const logDir = path.join(this.rootDir, 'data/logs');
      
      if (!fs.existsSync(logDir)) {
        return {
          passed: false,
          details: {
            error: 'Log directory does not exist'
          }
        };
      }

      const logFiles = fs.readdirSync(logDir)
        .filter(file => file.endsWith('.log'));

      const logSizes = logFiles.map(file => {
        const filePath = path.join(logDir, file);
        return {
          file,
          size: fs.statSync(filePath).size,
          modified: fs.statSync(filePath).mtime
        };
      });

      const totalSize = logSizes.reduce((sum, log) => sum + log.size, 0);
      const largestLog = logSizes.sort((a, b) => b.size - a.size)[0];
      const recentLogs = logSizes.filter(log => 
        Date.now() - log.modified.getTime() < 24 * 60 * 60 * 1000
      ).length;

      const issues = [];
      const warnings = [];

      if (logFiles.length === 0) {
        warnings.push('No log files found');
      }

      if (totalSize > 100 * 1024 * 1024) { // 100MB
        warnings.push(`Total log size is large: ${(totalSize / 1024 / 1024).toFixed(1)} MB`);
      }

      if (largestLog && largestLog.size > 50 * 1024 * 1024) { // 50MB
        warnings.push(`Large log file: ${largestLog.file} (${(largestLog.size / 1024 / 1024).toFixed(1)} MB)`);
      }

      if (recentLogs === 0) {
        warnings.push('No logs updated in the last 24 hours');
      }

      return {
        passed: issues.length === 0,
        details: {
          total_log_files: logFiles.length,
          total_log_size_mb: (totalSize / 1024 / 1024).toFixed(2),
          largest_log_file: largestLog ? `${largestLog.file} (${(largestLog.size / 1024 / 1024).toFixed(1)} MB)` : null,
          recent_logs_24h: recentLogs,
          issues,
          warnings
        }
      };

    } catch (error) {
      return {
        passed: false,
        details: {
          error: error.message
        }
      };
    }
  }

  /**
   * Check: System dependencies
   */
  checkDependencies() {
    const requiredExecutables = ['node', 'git', 'npm'];
    const found = [];
    const missing = [];

    requiredExecutables.forEach(cmd => {
      try {
        require('child_process').execSync(`which ${cmd}`, { stdio: 'pipe' });
        found.push(cmd);
      } catch (error) {
        missing.push(cmd);
      }
    });

    // Check Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.replace('v', '').split('.')[0]);
    const nodeVersionOk = nodeMajor >= 18;

    // Check npm version
    let npmVersion = 'unknown';
    try {
      npmVersion = require('child_process')
        .execSync('npm --version', { encoding: 'utf8' })
        .trim();
    } catch (error) {
      // npm not available
    }

    const issues = [];
    if (missing.length > 0) {
      issues.push(`Missing executables: ${missing.join(', ')}`);
    }
    if (!nodeVersionOk) {
      issues.push(`Node.js version ${nodeVersion} is below minimum required (v18)`);
    }

    return {
      passed: issues.length === 0,
      details: {
        node_version: nodeVersion,
        node_version_ok: nodeVersionOk,
        npm_version: npmVersion,
        found_executables: found,
        missing_executables: missing,
        issues
      }
    };
  }

  /**
   * Check: Website accessibility
   */
  async checkWebsiteAccessibility() {
    return new Promise((resolve) => {
      const url = 'https://satlantaspolrestayka.github.io/ops-ketupat-progo-2026/';
      
      https.get(url, (res) => {
        const statusCode = res.statusCode;
        
        resolve({
          passed: statusCode === 200,
          details: {
            status_code: statusCode,
            url,
            accessible: statusCode === 200,
            content_type: res.headers['content-type']
          }
        });
      }).on('error', (error) => {
        resolve({
          passed: false,
          details: {
            error: error.message,
            url,
            accessible: false
          }
        });
      });
    });
  }

  /**
   * Setup semua checks
   */
  setupChecks() {
    // Critical checks
    this.addCheck('config_files', () => this.checkConfigFiles(), true);
    this.addCheck('data_files', () => this.checkDataFiles(), true);
    this.addCheck('data_consistency', () => this.checkDataConsistency(), true);
    this.addCheck('dependencies', () => this.checkDependencies(), true);

    // Non-critical checks
    this.addCheck('backup_health', () => this.checkBackupHealth(), false);
    this.addCheck('log_files', () => this.checkLogFiles(), false);
    
    // Async checks (will be run separately)
    this.addCheck('github_connection', async () => await this.checkGitHubConnection(), false);
    this.addCheck('website_accessibility', async () => await this.checkWebsiteAccessibility(), false);
  }

  /**
   * Jalankan semua checks
   */
  async runChecks() {
    console.log('🏥 Starting system health check...\n');
    
    this.setupChecks();
    
    // Run synchronous checks
    for (const check of this.checks.filter(c => !c.checkFunction.constructor.name === 'AsyncFunction')) {
      try {
        console.log(`🔍 Running check: ${check.name}...`);
        const result = check.checkFunction();
        
        this.results.details.push({
          name: check.name,
          critical: check.critical,
          ...result
        });

        if (result.passed) {
          this.results.checks_passed++;
          check.status = 'passed';
          console.log(`  ✅ ${check.name}: PASSED`);
        } else {
          if (check.critical) {
            this.results.checks_failed++;
            check.status = 'failed';
            console.log(`  ❌ ${check.name}: FAILED (CRITICAL)`);
          } else {
            this.results.checks_warning++;
            check.status = 'warning';
            console.log(`  ⚠️  ${check.name}: WARNING`);
          }
        }
      } catch (error) {
        this.results.checks_failed++;
        check.status = 'failed';
        console.log(`  ❌ ${check.name}: ERROR - ${error.message}`);
        
        this.results.details.push({
          name: check.name,
          critical: check.critical,
          passed: false,
          error: error.message
        });
      }
    }

    // Run async checks
    for (const check of this.checks.filter(c => c.checkFunction.constructor.name === 'AsyncFunction')) {
      try {
        console.log(`🔍 Running async check: ${check.name}...`);
        const result = await check.checkFunction();
        
        this.results.details.push({
          name: check.name,
          critical: check.critical,
          ...result
        });

        if (result.passed) {
          this.results.checks_passed++;
          check.status = 'passed';
          console.log(`  ✅ ${check.name}: PASSED`);
        } else {
          if (check.critical) {
            this.results.checks_failed++;
            check.status = 'failed';
            console.log(`  ❌ ${check.name}: FAILED (CRITICAL)`);
          } else {
            this.results.checks_warning++;
            check.status = 'warning';
            console.log(`  ⚠️  ${check.name}: WARNING`);
          }
        }
      } catch (error) {
        this.results.checks_failed++;
        check.status = 'failed';
        console.log(`  ❌ ${check.name}: ERROR - ${error.message}`);
        
        this.results.details.push({
          name: check.name,
          critical: check.critical,
          passed: false,
          error: error.message
        });
      }
    }

    // Determine overall status
    const criticalFailed = this.results.details.some(
      d => d.critical && !d.passed
    );

    if (criticalFailed) {
      this.results.overall_status = 'critical';
    } else if (this.results.checks_failed > 0) {
      this.results.overall_status = 'degraded';
    } else if (this.results.checks_warning > 0) {
      this.results.overall_status = 'warning';
    } else {
      this.results.overall_status = 'healthy';
    }

    return this.results;
  }

  /**
   * Print report
   */
  printReport(results) {
    console.log('\n' + '='.repeat(70));
    console.log('📊 HEALTH CHECK REPORT');
    console.log('='.repeat(70));
    
    // Overall status dengan emoji
    const statusEmoji = {
      healthy: '✅',
      warning: '⚠️',
      degraded: '🔶',
      critical: '❌'
    };
    
    console.log(`\nOverall Status: ${statusEmoji[results.overall_status]} ${results.overall_status.toUpperCase()}`);
    console.log(`Timestamp: ${new Date(results.timestamp).toLocaleString()}`);
    console.log(`\nChecks: ${results.checks_passed} passed, ${results.checks_warning} warnings, ${results.checks_failed} failed`);
    
    // Detail setiap check
    console.log('\n' + '-'.repeat(70));
    console.log('DETAILED RESULTS:');
    console.log('-'.repeat(70));
    
    results.details.forEach((check, index) => {
      const icon = check.passed ? '✅' : (check.critical ? '❌' : '⚠️');
      const status = check.passed ? 'PASS' : (check.critical ? 'FAIL' : 'WARN');
      
      console.log(`\n${index + 1}. ${icon} ${check.name} [${status}]`);
      
      if (check.details) {
        if (check.details.issues && check.details.issues.length > 0) {
          console.log('   Issues:');
          check.details.issues.forEach(issue => console.log(`     • ${issue}`));
        }
        
        if (check.details.warnings && check.details.warnings.length > 0) {
          console.log('   Warnings:');
          check.details.warnings.forEach(warning => console.log(`     • ${warning}`));
        }
        
        // Print beberapa detail penting
        const importantKeys = Object.keys(check.details).filter(
          key => !['issues', 'warnings', 'error'].includes(key)
        );
        
        importantKeys.forEach(key => {
          if (check.details[key] !== null && check.details[key] !== undefined) {
            console.log(`   ${key}: ${check.details[key]}`);
          }
        });
      }
      
      if (check.error) {
        console.log(`   Error: ${check.error}`);
      }
    });
    
    // Recommendations
    console.log('\n' + '-'.repeat(70));
    console.log('RECOMMENDATIONS:');
    console.log('-'.repeat(70));
    
    const recommendations = [];
    
    if (results.overall_status === 'critical') {
      recommendations.push('IMMEDIATE ACTION REQUIRED: Critical checks failed');
    }
    
    results.details.forEach(check => {
      if (!check.passed && check.critical) {
        recommendations.push(`Fix critical issue in: ${check.name}`);
      }
      
      if (check.details?.issues?.length > 0) {
        check.details.issues.forEach(issue => {
          recommendations.push(`Resolve: ${issue}`);
        });
      }
    });
    
    if (recommendations.length === 0) {
      console.log('✅ No issues detected. System is healthy.');
    } else {
      recommendations.forEach((rec, index) => {
        console.log(`${index + 1}. ${rec}`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
  }

  /**
   * Simpan report ke file
   */
  saveReport(results) {
    const reportDir = path.join(this.rootDir, 'data/reports');
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, `health-check-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(results, null, 2));
    
    return reportFile;
  }

  /**
   * Main function
   */
  async run() {
    const results = await this.runChecks();
    this.printReport(results);
    
    const reportFile = this.saveReport(results);
    console.log(`\n📁 Report saved to: ${reportFile}`);
    
    return {
      success: results.overall_status !== 'critical',
      report: results,
      reportFile
    };
  }
}

// Run if called directly
if (require.main === module) {
  const checker = new SystemHealthChecker();
  checker.run().catch(console.error);
}

module.exports = SystemHealthChecker;
