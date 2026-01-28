#!/usr/bin/env node
/**
 * Sistem audit log untuk melacak semua perubahan data
 */

const fs = require('fs');
const path = require('path');

class AuditLogger {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.logDir = path.join(this.rootDir, 'data/logs/audit');
    this.currentLogFile = this.getCurrentLogFile();
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Dapatkan nama file log untuk hari ini
   */
  getCurrentLogFile() {
    const today = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `audit-${today}.log`);
  }

  /**
   * Buat entri log
   */
  log(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    
    // Tulis ke file log hari ini
    fs.appendFileSync(this.currentLogFile, JSON.stringify(logEntry) + '\n');
    
    // Juga tulis ke log konsolidasi
    const consolidatedLog = path.join(this.logDir, 'audit-consolidated.log');
    fs.appendFileSync(consolidatedLog, JSON.stringify(logEntry) + '\n');
    
    return logEntry;
  }

  /**
   * Log perubahan data parkir
   */
  logParkingUpdate(updateData) {
    return this.log({
      type: 'parking_update',
      action: 'update',
      user: updateData.user || 'unknown',
      location: updateData.location,
      changes: updateData.changes,
      ip_address: updateData.ip,
      user_agent: updateData.userAgent
    });
  }

  /**
   * Log aksi admin
   */
  logAdminAction(actionData) {
    return this.log({
      type: 'admin_action',
      action: actionData.action,
      user: actionData.user,
      target: actionData.target,
      details: actionData.details,
      ip_address: actionData.ip,
      user_agent: actionData.userAgent
    });
  }

  /**
   * Log error sistem
   */
  logSystemError(errorData) {
    return this.log({
      type: 'system_error',
      action: 'error',
      error: errorData.error,
      message: errorData.message,
      component: errorData.component,
      stack: errorData.stack,
      severity: errorData.severity || 'error'
    });
  }

  /**
   * Log backup activity
   */
  logBackupActivity(backupData) {
    return this.log({
      type: 'backup',
      action: backupData.action,
      file: backupData.file,
      size: backupData.size,
      success: backupData.success,
      error: backupData.error,
      triggered_by: backupData.triggeredBy
    });
  }

  /**
   * Log akses data
   */
  logDataAccess(accessData) {
    return this.log({
      type: 'data_access',
      action: 'access',
      user: accessData.user,
      endpoint: accessData.endpoint,
      method: accessData.method,
      ip_address: accessData.ip,
      user_agent: accessData.userAgent,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Query log berdasarkan kriteria
   */
  queryLogs(query = {}) {
    const logs = [];
    const logFiles = [];
    
    // Tentukan file log yang akan dibaca
    if (query.date) {
      const dateStr = new Date(query.date).toISOString().split('T')[0];
      const specificLog = path.join(this.logDir, `audit-${dateStr}.log`);
      if (fs.existsSync(specificLog)) {
        logFiles.push(specificLog);
      }
    } else {
      // Baca semua file log atau rentang tanggal
      const files = fs.readdirSync(this.logDir)
        .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
        .filter(file => !file.includes('consolidated'))
        .map(file => path.join(this.logDir, file));
      
      if (query.startDate || query.endDate) {
        const startDate = query.startDate ? new Date(query.startDate) : new Date(0);
        const endDate = query.endDate ? new Date(query.endDate) : new Date();
        
        files.forEach(file => {
          const match = file.match(/audit-(\d{4}-\d{2}-\d{2})\.log/);
          if (match) {
            const fileDate = new Date(match[1]);
            if (fileDate >= startDate && fileDate <= endDate) {
              logFiles.push(file);
            }
          }
        });
      } else {
        logFiles.push(...files);
      }
    }
    
    // Baca dan filter log
    logFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        content.split('\n').forEach(line => {
          if (line.trim()) {
            try {
              const logEntry = JSON.parse(line);
              
              // Filter berdasarkan kriteria
              let matches = true;
              
              if (query.type && logEntry.type !== query.type) {
                matches = false;
              }
              
              if (query.action && logEntry.action !== query.action) {
                matches = false;
              }
              
              if (query.user && logEntry.user !== query.user) {
                matches = false;
              }
              
              if (query.location && logEntry.location !== query.location) {
                matches = false;
              }
              
              if (query.startTime && new Date(logEntry.timestamp) < new Date(query.startTime)) {
                matches = false;
              }
              
              if (query.endTime && new Date(logEntry.timestamp) > new Date(query.endTime)) {
                matches = false;
              }
              
              if (matches) {
                logs.push(logEntry);
              }
              
            } catch (parseError) {
              console.warn(`⚠️ Could not parse log line in ${file}: ${parseError.message}`);
            }
          }
        });
      } catch (error) {
        console.warn(`⚠️ Could not read log file ${file}: ${error.message}`);
      }
    });
    
    // Sort berdasarkan timestamp (terbaru pertama)
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Pagination
    const page = query.page || 1;
    const limit = query.limit || 100;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    
    return {
      total: logs.length,
      page,
      limit,
      pages: Math.ceil(logs.length / limit),
      logs: logs.slice(startIndex, endIndex)
    };
  }

  /**
   * Generate laporan audit
   */
  generateAuditReport(startDate, endDate) {
    console.log(`📊 Generating audit report from ${startDate} to ${endDate}...`);
    
    const query = {
      startDate,
      endDate
    };
    
    const logs = this.queryLogs(query);
    
    // Analisis statistik
    const stats = {
      total_entries: logs.total,
      by_type: {},
      by_action: {},
      by_user: {},
      by_location: {},
      timeline: [],
      errors: 0,
      warnings: 0
    };
    
    logs.logs.forEach(log => {
      // Count by type
      stats.by_type[log.type] = (stats.by_type[log.type] || 0) + 1;
      
      // Count by action
      stats.by_action[log.action] = (stats.by_action[log.action] || 0) + 1;
      
      // Count by user
      if (log.user) {
        stats.by_user[log.user] = (stats.by_user[log.user] || 0) + 1;
      }
      
      // Count by location
      if (log.location) {
        stats.by_location[log.location] = (stats.by_location[log.location] || 0) + 1;
      }
      
      // Count errors and warnings
      if (log.type === 'system_error') {
        stats.errors++;
        if (log.severity === 'warning') {
          stats.warnings++;
        }
      }
      
      // Add to timeline
      const date = log.timestamp.split('T')[0];
      stats.timeline[date] = (stats.timeline[date] || 0) + 1;
    });
    
    // Generate report file
    const report = {
      generated_at: new Date().toISOString(),
      period: {
        start: startDate,
        end: endDate
      },
      summary: stats,
      recent_activities: logs.logs.slice(0, 50), // 50 aktivitas terbaru
      recommendations: this.generateRecommendations(stats)
    };
    
    // Save report
    const reportDir = path.join(this.rootDir, 'data/reports/audit');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, `audit-report-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`✅ Audit report generated: ${reportFile}`);
    
    return {
      report,
      reportFile
    };
  }

  /**
   * Generate recommendations dari statistik
   */
  generateRecommendations(stats) {
    const recommendations = [];
    
    // Check for high error rate
    const errorRate = stats.errors / stats.total_entries;
    if (errorRate > 0.1) { // 10% error rate
      recommendations.push('High error rate detected. Review system errors immediately.');
    }
    
    // Check for suspicious activities
    const parkingUpdates = stats.by_type['parking_update'] || 0;
    const adminActions = stats.by_type['admin_action'] || 0;
    
    if (adminActions > parkingUpdates * 2) {
      recommendations.push('High admin activity compared to parking updates. Verify admin actions.');
    }
    
    // Check for user distribution
    const users = Object.keys(stats.by_user);
    if (users.length === 1 && stats.total_entries > 100) {
      recommendations.push('All activities from single user. Consider adding more users or reviewing access.');
    }
    
    return recommendations;
  }

  /**
   * Bersihkan log lama
   */
  cleanupOldLogs(retentionDays = 90) {
    console.log(`🧹 Cleaning up audit logs older than ${retentionDays} days...`);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const logFiles = fs.readdirSync(this.logDir)
      .filter(file => file.startsWith('audit-') && file.endsWith('.log'))
      .filter(file => !file.includes('consolidated'));
    
    let deleted = 0;
    let kept = 0;
    
    logFiles.forEach(file => {
      const match = file.match(/audit-(\d{4}-\d{2}-\d{2})\.log/);
      if (match) {
        const fileDate = new Date(match[1]);
        const filePath = path.join(this.logDir, file);
        
        if (fileDate < cutoffDate) {
          fs.unlinkSync(filePath);
          deleted++;
          console.log(`   🗑️  Deleted: ${file}`);
        } else {
          kept++;
        }
      }
    });
    
    console.log(`✅ Cleanup complete: ${deleted} deleted, ${kept} kept`);
    
    return {
      deleted,
      kept,
      retention_days: retentionDays
    };
  }

  /**
   * Main function
   */
  async run() {
    console.log('📝 Audit Logger System\n');
    
    const args = process.argv.slice(2);
    
    if (args.includes('--query')) {
      const query = {};
      
      // Parse query parameters
      args.forEach((arg, index) => {
        if (arg === '--type' && args[index + 1]) {
          query.type = args[index + 1];
        }
        if (arg === '--action' && args[index + 1]) {
          query.action = args[index + 1];
        }
        if (arg === '--user' && args[index + 1]) {
          query.user = args[index + 1];
        }
        if (arg === '--location' && args[index + 1]) {
          query.location = args[index + 1];
        }
        if (arg === '--date' && args[index + 1]) {
          query.date = args[index + 1];
        }
        if (arg === '--start' && args[index + 1]) {
          query.startDate = args[index + 1];
        }
        if (arg === '--end' && args[index + 1]) {
          query.endDate = args[index + 1];
        }
        if (arg === '--page' && args[index + 1]) {
          query.page = parseInt(args[index + 1]);
        }
        if (arg === '--limit' && args[index + 1]) {
          query.limit = parseInt(args[index + 1]);
        }
      });
      
      const results = this.queryLogs(query);
      console.log(`📊 Found ${results.total} log entries`);
      console.log(JSON.stringify(results, null, 2));
      return results;
    }
    
    if (args.includes('--report')) {
      const startDate = args[args.indexOf('--report') + 1] || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const endDate = args[args.indexOf('--report') + 2] || new Date().toISOString().split('T')[0];
      
      return this.generateAuditReport(startDate, endDate);
    }
    
    if (args.includes('--cleanup')) {
      const retentionDays = parseInt(args[args.indexOf('--cleanup') + 1]) || 90;
      return this.cleanupOldLogs(retentionDays);
    }
    
    // Default: log test entry
    console.log('Creating test audit entry...');
    const testEntry = this.log({
      type: 'test',
      action: 'test',
      message: 'Audit logger test entry',
      test: true
    });
    
    console.log('✅ Test entry created:', testEntry);
    return testEntry;
  }
}

// Run if called directly
if (require.main === module) {
  const logger = new AuditLogger();
  logger.run().catch(console.error);
}

module.exports = AuditLogger;
