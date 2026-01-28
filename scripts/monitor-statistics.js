#!/usr/bin/env node
/**
 * Real-time monitoring untuk konsistensi data statistik
 */

const fs = require('fs');
const path = require('path');

class StatisticsMonitor {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.configFile = path.join(this.rootDir, 'config/locations-config.json');
    this.notificationConfig = path.join(this.rootDir, 'config/notifications.json');
    this.logDir = path.join(this.rootDir, 'data/logs');
    
    // Load configs
    this.config = this.loadConfig();
    this.notificationSettings = this.loadNotificationSettings();
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    } catch (error) {
      console.error('❌ Error loading config:', error.message);
      return null;
    }
  }

  loadNotificationSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.notificationConfig, 'utf8'));
    } catch (error) {
      console.warn('⚠️ Notification config not found, using defaults');
      return {
        thresholds: {
          utilization: { warning: 80, critical: 95 },
          data_consistency: { max_difference: 5 }
        }
      };
    }
  }

  /**
   * Hitung statistik dari data lokasi
   */
  calculateFromLocations(locations) {
    return locations.reduce((acc, loc) => {
      acc.bus.total += loc.bus?.total || 0;
      acc.bus.available += loc.bus?.available || 0;
      
      acc.mobil.total += loc.mobil?.total || 0;
      acc.mobil.available += loc.mobil?.available || 0;
      
      acc.motor.total += loc.motor?.total || 0;
      acc.motor.available += loc.motor?.available || 0;
      
      return acc;
    }, {
      bus: { total: 0, available: 0 },
      mobil: { total: 0, available: 0 },
      motor: { total: 0, available: 0 }
    });
  }

  /**
   * Hitung utilization percentage
   */
  calculateUtilization(calculated) {
    const utilization = {};
    
    ['bus', 'mobil', 'motor'].forEach(type => {
      const data = calculated[type];
      utilization[type] = data.total > 0 ? 
        ((data.total - data.available) / data.total) * 100 : 0;
    });
    
    // Overall utilization
    const totalCapacity = calculated.bus.total + calculated.mobil.total + calculated.motor.total;
    const totalAvailable = calculated.bus.available + calculated.mobil.available + calculated.motor.available;
    utilization.overall = totalCapacity > 0 ? 
      ((totalCapacity - totalAvailable) / totalCapacity) * 100 : 0;
    
    return utilization;
  }

  /**
   * Cek konsistensi antara calculated vs reported
   */
  checkConsistency(calculated, reported) {
    const issues = [];
    
    // Check bus
    const busDiff = Math.abs(calculated.bus.available - reported.total_available_bus);
    if (busDiff > this.notificationSettings.thresholds.data_consistency.max_difference) {
      issues.push({
        type: 'data_inconsistency',
        vehicle: 'bus',
        calculated: calculated.bus.available,
        reported: reported.total_available_bus,
        difference: busDiff,
        severity: busDiff > 10 ? 'critical' : 'warning'
      });
    }
    
    // Check mobil
    const mobilDiff = Math.abs(calculated.mobil.available - reported.total_available_mobil);
    if (mobilDiff > this.notificationSettings.thresholds.data_consistency.max_difference) {
      issues.push({
        type: 'data_inconsistency',
        vehicle: 'mobil',
        calculated: calculated.mobil.available,
        reported: reported.total_available_mobil,
        difference: mobilDiff,
        severity: mobilDiff > 10 ? 'critical' : 'warning'
      });
    }
    
    // Check motor
    const motorDiff = Math.abs(calculated.motor.available - reported.total_available_motor);
    if (motorDiff > this.notificationSettings.thresholds.data_consistency.max_difference) {
      issues.push({
        type: 'data_inconsistency',
        vehicle: 'motor',
        calculated: calculated.motor.available,
        reported: reported.total_available_motor,
        difference: motorDiff,
        severity: motorDiff > 10 ? 'critical' : 'warning'
      });
    }
    
    return issues;
  }

  /**
   * Cek high utilization locations
   */
  checkHighUtilization(locations) {
    const alerts = [];
    const { warning, critical } = this.notificationSettings.thresholds.utilization;
    
    locations.forEach(location => {
      ['bus', 'mobil', 'motor'].forEach(type => {
        const vehicle = location[type];
        if (vehicle && vehicle.total > 0) {
          const utilization = ((vehicle.total - vehicle.available) / vehicle.total) * 100;
          
          if (utilization >= critical) {
            alerts.push({
              type: 'high_utilization',
              location: location.nama,
              vehicle: type,
              utilization: utilization.toFixed(1),
              available: vehicle.available,
              total: vehicle.total,
              severity: 'critical'
            });
          } else if (utilization >= warning) {
            alerts.push({
              type: 'high_utilization',
              location: location.nama,
              vehicle: type,
              utilization: utilization.toFixed(1),
              available: vehicle.available,
              total: vehicle.total,
              severity: 'warning'
            });
          }
        }
      });
    });
    
    return alerts;
  }

  /**
   * Cek lokasi yang lama tidak diupdate
   */
  checkStaleUpdates(locations) {
    const alerts = [];
    const staleHours = this.notificationSettings.thresholds?.time_based?.no_update_alert_hours || 2;
    const now = new Date();
    
    locations.forEach(location => {
      let lastUpdate = null;
      
      // Cari timestamp update terakhir
      ['bus', 'mobil', 'motor'].forEach(type => {
        if (location[type]?.last_update) {
          const updateTime = new Date(location[type].last_update);
          if (!lastUpdate || updateTime > lastUpdate) {
            lastUpdate = updateTime;
          }
        }
      });
      
      if (lastUpdate) {
        const hoursDiff = (now - lastUpdate) / (1000 * 60 * 60);
        if (hoursDiff >= staleHours) {
          alerts.push({
            type: 'stale_update',
            location: location.nama,
            hours_since_update: hoursDiff.toFixed(1),
            last_update: lastUpdate.toISOString(),
            severity: hoursDiff > 4 ? 'critical' : 'warning'
          });
        }
      }
    });
    
    return alerts;
  }

  /**
   * Log issues ke file
   */
  logIssues(issues, alerts) {
    const logFile = path.join(this.logDir, `monitor-${new Date().toISOString().split('T')[0]}.log`);
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      check_type: 'statistics_monitor',
      issues_count: issues.length,
      alerts_count: alerts.length,
      issues,
      alerts,
      summary: {
        total_locations: this.config?.locations?.length || 0,
        total_checked: issues.length + alerts.length
      }
    };
    
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    return logFile;
  }

  /**
   * Kirim notifikasi berdasarkan severity
   */
  sendNotifications(issues, alerts) {
    const allNotifications = [...issues, ...alerts];
    const critical = allNotifications.filter(n => n.severity === 'critical');
    const warnings = allNotifications.filter(n => n.severity === 'warning');
    
    // Print ke console (default)
    if (critical.length > 0) {
      console.log('\n🚨 CRITICAL ALERTS:');
      critical.forEach(alert => {
        console.log(`  ❌ ${alert.type.toUpperCase()}: ${alert.location || alert.vehicle}`);
        if (alert.difference) console.log(`     Difference: ${alert.difference} units`);
        if (alert.utilization) console.log(`     Utilization: ${alert.utilization}%`);
      });
    }
    
    if (warnings.length > 0) {
      console.log('\n⚠️ WARNINGS:');
      warnings.forEach(warning => {
        console.log(`  ⚠️ ${warning.type.toUpperCase()}: ${warning.location || warning.vehicle}`);
        if (warning.difference) console.log(`     Difference: ${warning.difference} units`);
        if (warning.utilization) console.log(`     Utilization: ${warning.utilization}%`);
      });
    }
    
    // TODO: Implement email/slack/telegram notifications
    // berdasarkan config di notifications.json
    
    return {
      critical: critical.length,
      warnings: warnings.length,
      total: allNotifications.length
    };
  }

  /**
   * Generate report
   */
  generateReport(calculated, utilization, issues, alerts) {
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        calculated: {
          bus: calculated.bus.available,
          mobil: calculated.mobil.available,
          motor: calculated.motor.available
        },
        utilization: {
          bus: utilization.bus.toFixed(1),
          mobil: utilization.mobil.toFixed(1),
          motor: utilization.motor.toFixed(1),
          overall: utilization.overall.toFixed(1)
        },
        issues_found: issues.length,
        alerts_generated: alerts.length,
        system_status: issues.length > 0 ? 'needs_attention' : 'healthy'
      },
      details: {
        issues,
        alerts
      },
      recommendations: []
    };
    
    // Tambahkan rekomendasi
    if (issues.length > 0) {
      report.recommendations.push('Run fix-statistics.js to correct inconsistencies');
    }
    
    if (alerts.filter(a => a.type === 'high_utilization').length > 0) {
      report.recommendations.push('Consider adding temporary parking capacity');
    }
    
    if (alerts.filter(a => a.type === 'stale_update').length > 0) {
      report.recommendations.push('Contact location officers for updates');
    }
    
    return report;
  }

  /**
   * Main monitoring function
   */
  async run() {
    console.log('📊 Starting statistics monitoring...\n');
    
    try {
      // Load data
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      
      // Calculate from locations
      const calculated = this.calculateFromLocations(data.locations);
      const utilization = this.calculateUtilization(calculated);
      
      // Check consistency
      const consistencyIssues = this.checkConsistency(calculated, data.statistics);
      
      // Check high utilization
      const utilizationAlerts = this.checkHighUtilization(data.locations);
      
      // Check stale updates
      const staleAlerts = this.checkStaleUpdates(data.locations);
      
      const allAlerts = [...utilizationAlerts, ...staleAlerts];
      
      // Log issues
      const logFile = this.logIssues(consistencyIssues, allAlerts);
      
      // Send notifications
      const notifications = this.sendNotifications(consistencyIssues, allAlerts);
      
      // Generate report
      const report = this.generateReport(calculated, utilization, consistencyIssues, allAlerts);
      
      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📈 MONITORING SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Calculated: Bus ${calculated.bus.available}, Mobil ${calculated.mobil.available}, Motor ${calculated.motor.available}`);
      console.log(`📊 Utilization: Bus ${utilization.bus.toFixed(1)}%, Mobil ${utilization.mobil.toFixed(1)}%, Motor ${utilization.motor.toFixed(1)}%`);
      console.log(`⚠️  Issues: ${consistencyIssues.length} inconsistencies, ${allAlerts.length} alerts`);
      console.log(`📁 Log file: ${logFile}`);
      console.log('='.repeat(60));
      
      return {
        success: true,
        report,
        notifications,
        needs_action: consistencyIssues.length > 0 || allAlerts.length > 0
      };
      
    } catch (error) {
      console.error('❌ Monitoring failed:', error.message);
      
      // Log error
      const errorLog = {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      };
      
      const errorFile = path.join(this.logDir, 'monitor-errors.log');
      fs.appendFileSync(errorFile, JSON.stringify(errorLog) + '\n');
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Continuous monitoring mode
   */
  async startContinuousMonitoring(intervalMinutes = 5) {
    console.log(`🔍 Starting continuous monitoring (${intervalMinutes} minute intervals)...`);
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    // Run immediately first
    await this.run();
    
    // Then run at intervals
    setInterval(async () => {
      console.log(`\n🔄 Running scheduled check at ${new Date().toLocaleTimeString()}`);
      await this.run();
    }, intervalMs);
  }
}

// Run if called directly
if (require.main === module) {
  const monitor = new StatisticsMonitor();
  
  const args = process.argv.slice(2);
  if (args.includes('--continuous')) {
    const interval = parseInt(args[args.indexOf('--continuous') + 1]) || 5;
    monitor.startContinuousMonitoring(interval);
  } else {
    monitor.run();
  }
}

module.exports = StatisticsMonitor;
