#!/usr/bin/env node
/**
 * Script untuk mengirim notifikasi utilisasi parkir tinggi
 */

const fs = require('fs');
const path = require('path');

class UtilizationNotifier {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.configFile = path.join(this.rootDir, 'config/notifications.json');
    this.logDir = path.join(this.rootDir, 'data/logs');
    
    // Load config
    this.config = this.loadConfig();
    
    // Ensure log directory exists
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    } catch (error) {
      console.warn('⚠️ Notification config not found, using defaults');
      return {
        notification_settings: {
          method: 'console',
          log_level: 'info'
        },
        thresholds: {
          utilization: {
            warning: 80,
            critical: 95
          }
        },
        alert_templates: {
          high_utilization: {
            title: "🚨 PARKIR HAMPIR PENUH",
            message: "Lokasi {location} mencapai {utilization}% utilisasi. Kapasitas tersisa: {available}/{total}"
          }
        }
      };
    }
  }

  /**
   * Analisis utilisasi semua lokasi
   */
  analyzeUtilization(data) {
    const alerts = [];
    const { warning, critical } = this.config.thresholds.utilization;

    data.locations.forEach(location => {
      // Skip locations with special status
      if (location.status === 'special') return;

      ['bus', 'mobil', 'motor'].forEach(vehicleType => {
        const vehicle = location[vehicleType];
        
        // Skip if vehicle type not available
        if (!vehicle || vehicle.total === 0 || vehicle.status === 'not_available') {
          return;
        }

        // Hitung utilisasi
        const utilization = vehicle.total > 0 ? 
          ((vehicle.total - vehicle.available) / vehicle.total) * 100 : 0;

        // Cek threshold
        if (utilization >= critical) {
          alerts.push({
            type: 'critical_utilization',
            location: location.nama,
            vehicle: vehicleType,
            utilization: utilization.toFixed(1),
            available: vehicle.available,
            total: vehicle.total,
            last_update: vehicle.last_update,
            severity: 'critical',
            timestamp: new Date().toISOString()
          });
        } else if (utilization >= warning) {
          alerts.push({
            type: 'warning_utilization',
            location: location.nama,
            vehicle: vehicleType,
            utilization: utilization.toFixed(1),
            available: vehicle.available,
            total: vehicle.total,
            last_update: vehicle.last_update,
            severity: 'warning',
            timestamp: new Date().toISOString()
          });
        }
      });
    });

    return alerts;
  }

  /**
   * Analisis utilisasi keseluruhan sistem
   */
  analyzeSystemUtilization(data) {
    const stats = data.statistics;
    const totals = {
      bus: stats.total_bus_capacity,
      mobil: stats.total_mobil_capacity,
      motor: stats.total_motor_capacity
    };
    
    const available = {
      bus: stats.total_available_bus,
      mobil: stats.total_available_mobil,
      motor: stats.total_available_motor
    };

    const systemAlerts = [];

    ['bus', 'mobil', 'motor'].forEach(type => {
      if (totals[type] > 0) {
        const utilization = ((totals[type] - available[type]) / totals[type]) * 100;
        
        if (utilization >= 90) {
          systemAlerts.push({
            type: 'system_critical',
            vehicle: type,
            utilization: utilization.toFixed(1),
            available: available[type],
            total: totals[type],
            severity: 'critical',
            message: `Sistem ${type} mencapai ${utilization.toFixed(1)}% utilisasi`
          });
        }
      }
    });

    return systemAlerts;
  }

  /**
   * Format pesan notifikasi
   */
  formatMessage(template, data) {
    let message = template.message;
    
    // Replace placeholders
    message = message.replace('{location}', data.location || 'Unknown');
    message = message.replace('{utilization}', data.utilization || '0');
    message = message.replace('{available}', data.available || '0');
    message = message.replace('{total}', data.total || '0');
    message = message.replace('{vehicle}', data.vehicle || 'kendaraan');
    
    return message;
  }

  /**
   * Kirim notifikasi ke console (default)
   */
  sendConsoleNotification(alerts) {
    if (alerts.length === 0) {
      console.log('✅ No utilization alerts to send');
      return;
    }

    console.log('\n' + '='.repeat(70));
    console.log('🚨 UTILIZATION ALERTS');
    console.log('='.repeat(70));

    // Group by severity
    const critical = alerts.filter(a => a.severity === 'critical');
    const warning = alerts.filter(a => a.severity === 'warning');

    if (critical.length > 0) {
      console.log('\n🔴 CRITICAL UTILIZATION (>95%):');
      critical.forEach(alert => {
        console.log(`\n📍 ${alert.location} - ${alert.vehicle.toUpperCase()}`);
        console.log(`   Utilization: ${alert.utilization}%`);
        console.log(`   Available: ${alert.available}/${alert.total}`);
        console.log(`   Last Update: ${new Date(alert.last_update).toLocaleString()}`);
      });
    }

    if (warning.length > 0) {
      console.log('\n🟡 WARNING UTILIZATION (80-95%):');
      warning.forEach(alert => {
        console.log(`\n📍 ${alert.location} - ${alert.vehicle.toUpperCase()}`);
        console.log(`   Utilization: ${alert.utilization}%`);
        console.log(`   Available: ${alert.available}/${alert.total}`);
      });
    }

    console.log('\n' + '='.repeat(70));
    console.log(`📊 Total Alerts: ${alerts.length} (${critical.length} critical, ${warning.length} warning)`);
    console.log('='.repeat(70));
  }

  /**
   * Kirim notifikasi via email
   */
  async sendEmailNotification(alerts) {
    // Implementation untuk email
    console.log('📧 Email notification would be sent (not implemented)');
    console.log(`   Alerts: ${alerts.length}`);
    
    // Log untuk development
    const emailLog = {
      timestamp: new Date().toISOString(),
      method: 'email',
      alerts_count: alerts.length,
      alerts: alerts
    };
    
    const logFile = path.join(this.logDir, 'email-notifications.log');
    fs.appendFileSync(logFile, JSON.stringify(emailLog) + '\n');
  }

  /**
   * Kirim notifikasi via Slack
   */
  async sendSlackNotification(alerts) {
    // Implementation untuk Slack
    console.log('💬 Slack notification would be sent (not implemented)');
    console.log(`   Alerts: ${alerts.length}`);
    
    // Log untuk development
    const slackLog = {
      timestamp: new Date().toISOString(),
      method: 'slack',
      alerts_count: alerts.length,
      alerts: alerts
    };
    
    const logFile = path.join(this.logDir, 'slack-notifications.log');
    fs.appendFileSync(logFile, JSON.stringify(slackLog) + '\n');
  }

  /**
   * Kirim notifikasi sesuai config
   */
  async sendNotifications(alerts) {
    if (alerts.length === 0) {
      return { sent: 0, method: 'none' };
    }

    const method = this.config.notification_settings?.method || 'console';
    
    try {
      switch (method) {
        case 'email':
          await this.sendEmailNotification(alerts);
          break;
        case 'slack':
          await this.sendSlackNotification(alerts);
          break;
        case 'telegram':
          console.log('📱 Telegram notification would be sent (not implemented)');
          break;
        case 'whatsapp':
          console.log('📲 WhatsApp notification would be sent (not implemented)');
          break;
        case 'console':
        default:
          this.sendConsoleNotification(alerts);
          break;
      }
      
      return {
        sent: alerts.length,
        method,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error sending notifications:', error.message);
      return {
        sent: 0,
        method,
        error: error.message
      };
    }
  }

  /**
   * Generate report harian
   */
  generateDailyReport(data) {
    const report = {
      date: new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
      summary: {
        total_locations: data.locations.length,
        total_capacity: {
          bus: data.statistics.total_bus_capacity,
          mobil: data.statistics.total_mobil_capacity,
          motor: data.statistics.total_motor_capacity,
          total: data.statistics.total_bus_capacity + 
                data.statistics.total_mobil_capacity + 
                data.statistics.total_motor_capacity
        },
        total_available: {
          bus: data.statistics.total_available_bus,
          mobil: data.statistics.total_available_mobil,
          motor: data.statistics.total_available_motor,
          total: data.statistics.total_available_bus + 
                data.statistics.total_available_mobil + 
                data.statistics.total_available_motor
        }
      },
      top_utilized_locations: [],
      recommendations: []
    };

    // Hitung utilisasi per lokasi
    data.locations.forEach(location => {
      let totalCapacity = 0;
      let totalAvailable = 0;

      ['bus', 'mobil', 'motor'].forEach(type => {
        totalCapacity += location[type]?.total || 0;
        totalAvailable += location[type]?.available || 0;
      });

      if (totalCapacity > 0) {
        const utilization = ((totalCapacity - totalAvailable) / totalCapacity) * 100;
        
        if (utilization > 0) {
          report.top_utilized_locations.push({
            location: location.nama,
            utilization: utilization.toFixed(1),
            available: totalAvailable,
            total: totalCapacity
          });
        }
      }
    });

    // Sort by utilization (descending)
    report.top_utilized_locations.sort((a, b) => b.utilization - a.utilization);
    report.top_utilized_locations = report.top_utilized_locations.slice(0, 5);

    // Generate recommendations
    const highUtilization = report.top_utilized_locations.filter(loc => loc.utilization >= 80);
    if (highUtilization.length > 0) {
      report.recommendations.push(
        `Consider adding capacity at: ${highUtilization.map(loc => loc.location).join(', ')}`
      );
    }

    // Save report
    const reportDir = path.join(this.rootDir, 'data/reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    const reportFile = path.join(reportDir, `daily-report-${report.date}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    return report;
  }

  /**
   * Main function
   */
  async run() {
    console.log('📢 Starting utilization notification system...\n');
    
    try {
      // Load data
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      
      // Analyze utilization
      console.log('📊 Analyzing parking utilization...');
      const locationAlerts = this.analyzeUtilization(data);
      const systemAlerts = this.analyzeSystemUtilization(data);
      
      const allAlerts = [...locationAlerts, ...systemAlerts];
      
      // Send notifications
      console.log(`🔔 Sending ${allAlerts.length} alerts...`);
      const notificationResult = await this.sendNotifications(allAlerts);
      
      // Generate daily report (if it's morning)
      const hour = new Date().getHours();
      if (hour === 8) { // 08:00 AM
        console.log('📈 Generating daily report...');
        const report = this.generateDailyReport(data);
        console.log(`✅ Daily report saved: ${report.date}`);
      }
      
      // Log results
      const logEntry = {
        timestamp: new Date().toISOString(),
        alerts_generated: allAlerts.length,
        critical_alerts: allAlerts.filter(a => a.severity === 'critical').length,
        warning_alerts: allAlerts.filter(a => a.severity === 'warning').length,
        notification_result: notificationResult,
        system_status: allAlerts.length > 0 ? 'needs_attention' : 'healthy'
      };
      
      const logFile = path.join(this.logDir, 'utilization-notifications.log');
      fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
      
      // Print summary
      console.log('\n' + '='.repeat(60));
      console.log('📋 NOTIFICATION SUMMARY');
      console.log('='.repeat(60));
      console.log(`✅ Analysis complete: ${allAlerts.length} alerts generated`);
      console.log(`📤 Notifications sent via: ${notificationResult.method}`);
      console.log(`📁 Log saved to: ${logFile}`);
      console.log('='.repeat(60));
      
      return {
        success: true,
        alerts: allAlerts.length,
        notificationResult,
        logFile
      };
      
    } catch (error) {
      console.error('❌ Utilization notification failed:', error.message);
      
      // Log error
      const errorLog = {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      };
      
      const errorFile = path.join(this.logDir, 'notification-errors.log');
      fs.appendFileSync(errorFile, JSON.stringify(errorLog) + '\n');
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Manual trigger untuk testing
   */
  async testNotification() {
    console.log('🧪 Testing notification system...');
    
    // Create test data
    const testAlerts = [
      {
        type: 'test_critical',
        location: 'SENOPATI',
        vehicle: 'mobil',
        utilization: '96.5',
        available: 8,
        total: 200,
        severity: 'critical',
        timestamp: new Date().toISOString()
      },
      {
        type: 'test_warning',
        location: 'MALIOBORO II',
        vehicle: 'motor',
        utilization: '85.2',
        available: 37,
        total: 250,
        severity: 'warning',
        timestamp: new Date().toISOString()
      }
    ];
    
    console.log(`📤 Sending ${testAlerts.length} test alerts...`);
    await this.sendNotifications(testAlerts);
    
    console.log('✅ Test completed');
  }
}

// Run if called directly
if (require.main === module) {
  const notifier = new UtilizationNotifier();
  
  const args = process.argv.slice(2);
  if (args.includes('--test')) {
    notifier.testNotification();
  } else if (args.includes('--report')) {
    // Load data and generate report
    const data = JSON.parse(fs.readFileSync(notifier.dataFile, 'utf8'));
    const report = notifier.generateDailyReport(data);
    console.log('📈 Daily report generated:', report.date);
  } else {
    notifier.run();
  }
}

module.exports = UtilizationNotifier;
