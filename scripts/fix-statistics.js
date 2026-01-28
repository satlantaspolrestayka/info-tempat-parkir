#!/usr/bin/env node
/**
 * Script untuk memperbaiki statistik data parkir yang tidak konsisten
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class StatisticsFixer {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.configFile = path.join(this.rootDir, 'config/locations-config.json');
    this.backupDir = path.join(this.rootDir, 'data/backups');
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Buat backup sebelum memperbaiki
   */
  createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(this.backupDir, `pre-fix-${timestamp}.json`);
    
    if (fs.existsSync(this.dataFile)) {
      const data = fs.readFileSync(this.dataFile, 'utf8');
      fs.writeFileSync(backupFile, data);
      console.log(`✅ Backup created: ${backupFile}`);
      return backupFile;
    }
    return null;
  }

  /**
   * Hitung ulang statistik dari data lokasi
   */
  calculateStatistics(locations) {
    let stats = {
      total_bus_capacity: 0,
      total_mobil_capacity: 0,
      total_motor_capacity: 0,
      total_available_bus: 0,
      total_available_mobil: 0,
      total_available_motor: 0
    };

    locations.forEach(location => {
      stats.total_bus_capacity += location.bus?.total || 0;
      stats.total_mobil_capacity += location.mobil?.total || 0;
      stats.total_motor_capacity += location.motor?.total || 0;
      
      stats.total_available_bus += location.bus?.available || 0;
      stats.total_available_mobil += location.mobil?.available || 0;
      stats.total_available_motor += location.motor?.available || 0;
    });

    return stats;
  }

  /**
   * Periksa konsistensi antara config dan data
   */
  checkConsistency(data, config) {
    const issues = [];
    
    // Map config locations by code
    const configMap = {};
    config.locations.forEach(loc => {
      configMap[loc.code] = loc;
    });

    // Check each data location
    data.locations.forEach((dataLoc, index) => {
      const configLoc = configMap[dataLoc.nama];
      if (!configLoc) {
        issues.push(`Location ${dataLoc.nama} not found in config`);
        return;
      }

      // Check capacities
      if (dataLoc.bus.total !== configLoc.capacity.bus.total) {
        issues.push(`${dataLoc.nama}: Bus capacity mismatch (data: ${dataLoc.bus.total}, config: ${configLoc.capacity.bus.total})`);
      }
      
      if (dataLoc.mobil.total !== configLoc.capacity.mobil.total) {
        issues.push(`${dataLoc.nama}: Mobil capacity mismatch (data: ${dataLoc.mobil.total}, config: ${configLoc.capacity.mobil.total})`);
      }
      
      if (dataLoc.motor.total !== configLoc.capacity.motor.total) {
        issues.push(`${dataLoc.nama}: Motor capacity mismatch (data: ${dataLoc.motor.total}, config: ${configLoc.capacity.motor.total})`);
      }

      // Check available doesn't exceed total
      if (dataLoc.bus.available > dataLoc.bus.total) {
        issues.push(`${dataLoc.nama}: Bus available (${dataLoc.bus.available}) exceeds total (${dataLoc.bus.total})`);
        dataLoc.bus.available = dataLoc.bus.total;
      }
      
      if (dataLoc.mobil.available > dataLoc.mobil.total) {
        issues.push(`${dataLoc.nama}: Mobil available (${dataLoc.mobil.available}) exceeds total (${dataLoc.mobil.total})`);
        dataLoc.mobil.available = dataLoc.mobil.total;
      }
      
      if (dataLoc.motor.available > dataLoc.motor.total) {
        issues.push(`${dataLoc.nama}: Motor available (${dataLoc.motor.available}) exceeds total (${dataLoc.motor.total})`);
        dataLoc.motor.available = dataLoc.motor.total;
      }
    });

    return { issues, data };
  }

  /**
   * Perbaiki statistik utama
   */
  fixMainStatistics(data) {
    const calculated = this.calculateStatistics(data.locations);
    
    // Update statistics section
    data.statistics = {
      ...data.statistics,
      ...calculated,
      last_recalculated: new Date().toISOString(),
      recalculated_by: 'fix-statistics.js',
      version: '2.0.0'
    };

    return data;
  }

  /**
   * Main function
   */
  async run() {
    console.log('🔧 Starting statistics fix process...\n');
    
    try {
      // Load data
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const config = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      
      // Create backup
      const backupFile = this.createBackup();
      
      // Check and fix consistency
      console.log('📋 Checking data consistency...');
      const { issues, data: fixedData } = this.checkConsistency(data, config);
      
      if (issues.length > 0) {
        console.log(`⚠️ Found ${issues.length} issues:`);
        issues.forEach(issue => console.log(`  - ${issue}`));
      } else {
        console.log('✅ No consistency issues found');
      }
      
      // Fix main statistics
      console.log('\n📊 Fixing main statistics...');
      const finalData = this.fixMainStatistics(fixedData);
      
      // Save fixed data
      fs.writeFileSync(this.dataFile, JSON.stringify(finalData, null, 2));
      
      // Log results
      console.log('\n✅ Statistics fixed successfully!');
      console.log(`📁 Backup saved: ${backupFile}`);
      console.log(`🚌 Bus: ${finalData.statistics.total_available_bus}/${finalData.statistics.total_bus_capacity}`);
      console.log(`🚗 Mobil: ${finalData.statistics.total_available_mobil}/${finalData.statistics.total_mobil_capacity}`);
      console.log(`🏍️ Motor: ${finalData.statistics.total_available_motor}/${finalData.statistics.total_motor_capacity}`);
      
      // Commit changes if in git repository
      try {
        execSync('git add data/parkir-data.json', { cwd: this.rootDir });
        execSync('git commit -m "🔧 Auto-fix statistics"', { cwd: this.rootDir });
        console.log('💾 Changes committed to git');
      } catch (gitError) {
        console.log('ℹ️ Git commit skipped (not a git repo or no changes)');
      }
      
      return {
        success: true,
        backup: backupFile,
        issues: issues.length,
        statistics: finalData.statistics
      };
      
    } catch (error) {
      console.error('❌ Error fixing statistics:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Quick fix mode (for emergency)
   */
  async quickFix() {
    console.log('🚀 Running quick fix...');
    
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const fixedData = this.fixMainStatistics(data);
      
      fs.writeFileSync(this.dataFile, JSON.stringify(fixedData, null, 2));
      console.log('✅ Quick fix completed');
      
      return {
        success: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Quick fix failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Run if called directly
if (require.main === module) {
  const fixer = new StatisticsFixer();
  
  // Check for command line arguments
  const args = process.argv.slice(2);
  if (args.includes('--quick')) {
    fixer.quickFix();
  } else {
    fixer.run();
  }
}

module.exports = StatisticsFixer;
