#!/usr/bin/env node
/**
 * Script untuk pemulihan darurat sistem parkir
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class EmergencyRecovery {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.backupDir = path.join(this.rootDir, 'data/backups');
    this.logDir = path.join(this.rootDir, 'data/logs');
    
    // Ensure directories exist
    [this.backupDir, this.logDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  /**
   * Log aktivitas pemulihan
   */
  logRecovery(action, details) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      details
    };
    
    const logFile = path.join(this.logDir, 'emergency-recovery.log');
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
    
    return logFile;
  }

  /**
   * Cek status file data
   */
  checkDataFile() {
    console.log('🔍 Checking data file status...');
    
    if (!fs.existsSync(this.dataFile)) {
      return {
        exists: false,
        error: 'Data file not found',
        severity: 'critical'
      };
    }
    
    try {
      const stats = fs.statSync(this.dataFile);
      const content = fs.readFileSync(this.dataFile, 'utf8');
      
      // Cek jika file kosong
      if (stats.size === 0) {
        return {
          exists: true,
          size: 0,
          error: 'Data file is empty',
          severity: 'critical'
        };
      }
      
      // Cek jika valid JSON
      const data = JSON.parse(content);
      
      // Cek struktur dasar
      if (!data.locations || !Array.isArray(data.locations)) {
        return {
          exists: true,
          size: stats.size,
          error: 'Invalid data structure: missing locations array',
          severity: 'critical'
        };
      }
      
      return {
        exists: true,
        size: stats.size,
        valid: true,
        locations: data.locations.length,
        last_updated: data.metadata?.last_updated
      };
      
    } catch (error) {
      return {
        exists: true,
        error: `Data file corrupted: ${error.message}`,
        severity: 'critical'
      };
    }
  }

  /**
   * Dapatkan backup terbaru
   */
  getLatestBackup() {
    const latestFile = path.join(this.backupDir, 'latest-backup.json');
    
    if (!fs.existsSync(latestFile)) {
      // Cari file backup terbaru berdasarkan timestamp
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('backup-compressed-') && file.endsWith('.json.gz'))
        .map(file => {
          const match = file.match(/backup-compressed-(.+)\.json\.gz/);
          return {
            file,
            timestamp: match ? new Date(match[1].replace(/-/g, ':')) : new Date(0),
            path: path.join(this.backupDir, file)
          };
        })
        .filter(b => !isNaN(b.timestamp.getTime()))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      if (backupFiles.length === 0) {
        return null;
      }
      
      return backupFiles[0];
    }
    
    try {
      const latestInfo = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
      return {
        file: path.basename(latestInfo.backup_file),
        timestamp: new Date(latestInfo.timestamp),
        path: latestInfo.backup_file
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Restore dari backup
   */
  async restoreFromBackup(backupPath) {
    console.log(`🔄 Restoring from backup: ${backupPath}`);
    
    // Backup file saat ini terlebih dahulu
    const currentBackup = path.join(this.backupDir, `pre-recovery-${Date.now()}.json`);
    if (fs.existsSync(this.dataFile)) {
      fs.copyFileSync(this.dataFile, currentBackup);
      console.log(`📁 Current data backed up to: ${currentBackup}`);
    }
    
    // Decompress backup jika diperlukan
    let backupData;
    if (backupPath.endsWith('.gz')) {
      const zlib = require('zlib');
      const compressed = fs.readFileSync(backupPath);
      backupData = JSON.parse(zlib.gunzipSync(compressed).toString());
    } else {
      backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    }
    
    // Pastikan kita memiliki data yang benar
    const dataToRestore = backupData.data || backupData;
    
    // Update metadata
    dataToRestore.metadata = {
      ...dataToRestore.metadata,
      recovered_at: new Date().toISOString(),
      recovery_source: backupPath,
      pre_recovery_backup: currentBackup,
      recovery_type: 'emergency'
    };
    
    // Tulis data yang dipulihkan
    fs.writeFileSync(this.dataFile, JSON.stringify(dataToRestore, null, 2));
    
    console.log('✅ Data restored successfully');
    
    this.logRecovery('restore_from_backup', {
      backup_file: backupPath,
      pre_recovery_backup: currentBackup,
      restored_at: new Date().toISOString()
    });
    
    return {
      success: true,
      backup_used: backupPath,
      pre_recovery_backup: currentBackup,
      data_restored: dataToRestore.metadata.last_updated
    };
  }

  /**
   * Buat data darurat minimal
   */
  createEmergencyData() {
    console.log('🚨 Creating emergency data structure...');
    
    const emergencyData = {
      metadata: {
        last_updated: new Date().toISOString(),
        updated_by: 'emergency-recovery.js',
        version: 'emergency-1.0',
        total_locations: 15,
        operation_name: 'Ops Ketupat Progo 2026',
        operation_period: '20-26 April 2026',
        emergency_created: true
      },
      statistics: {
        total_bus_capacity: 454,
        total_mobil_capacity: 1690,
        total_motor_capacity: 1682,
        total_available_bus: 454,
        total_available_mobil: 1690,
        total_available_motor: 1682,
        utilization_percent: {
          bus: "0.0",
          mobil: "0.0",
          motor: "0.0",
          overall: "0.0"
        },
        update_count_today: 0,
        last_processed: new Date().toISOString(),
        emergency_mode: true
      },
      locations: []
    };
    
    // Tambahkan lokasi dasar
    const locationsConfig = path.join(this.rootDir, 'config/locations-config.json');
    if (fs.existsSync(locationsConfig)) {
      try {
        const config = JSON.parse(fs.readFileSync(locationsConfig, 'utf8'));
        config.locations.forEach(loc => {
          emergencyData.locations.push({
            id: loc.id,
            nama: loc.name,
            alamat: loc.address,
            bus: {
              total: loc.capacity.bus.total,
              available: loc.capacity.bus.total,
              last_update: new Date().toISOString(),
              updated_by: 'emergency-recovery',
              status: 'empty'
            },
            mobil: {
              total: loc.capacity.mobil.total,
              available: loc.capacity.mobil.total,
              last_update: new Date().toISOString(),
              updated_by: 'emergency-recovery',
              status: 'empty'
            },
            motor: {
              total: loc.capacity.motor.total,
              available: loc.capacity.motor.total,
              last_update: new Date().toISOString(),
              updated_by: 'emergency-recovery',
              status: 'empty'
            },
            koordinat: loc.coordinates,
            status: loc.status,
            petugas: `P${loc.id.toString().padStart(3, '0')}${loc.code.substring(0, 3)}`,
            operational_hours: loc.operational_hours,
            notes: loc.notes || '',
            emergency_created: true
          });
        });
      } catch (error) {
        console.warn('⚠️ Could not load config, using minimal data');
      }
    }
    
    // Jika tidak ada config, buat data minimal
    if (emergencyData.locations.length === 0) {
      emergencyData.locations = [
        {
          id: 1,
          nama: "SENOPATI",
          alamat: "JL P. SENOPATI",
          bus: { total: 62, available: 62, last_update: new Date().toISOString(), updated_by: 'emergency', status: 'empty' },
          mobil: { total: 200, available: 200, last_update: new Date().toISOString(), updated_by: 'emergency', status: 'empty' },
          motor: { total: 0, available: 0, last_update: new Date().toISOString(), updated_by: 'emergency', status: 'not_available' },
          koordinat: "-7.8017074,110.3681792",
          status: "open",
          petugas: "P001SEN",
          operational_hours: "06:00-22:00",
          notes: "",
          emergency_created: true
        }
      ];
    }
    
    // Backup data saat ini jika ada
    if (fs.existsSync(this.dataFile)) {
      const backupFile = path.join(this.backupDir, `pre-emergency-${Date.now()}.json`);
      fs.copyFileSync(this.dataFile, backupFile);
      console.log(`📁 Original data backed up to: ${backupFile}`);
    }
    
    // Tulis data darurat
    fs.writeFileSync(this.dataFile, JSON.stringify(emergencyData, null, 2));
    
    console.log('✅ Emergency data created');
    
    this.logRecovery('create_emergency_data', {
      locations_created: emergencyData.locations.length,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      locations: emergencyData.locations.length,
      emergency: true
    };
  }

  /**
   * Reset data ke kapasitas penuh
   */
  resetToFullCapacity() {
    console.log('🔄 Resetting all locations to full capacity...');
    
    if (!fs.existsSync(this.dataFile)) {
      console.error('❌ Data file not found');
      return { success: false, error: 'Data file not found' };
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      
      // Backup data saat ini
      const backupFile = path.join(this.backupDir, `pre-reset-${Date.now()}.json`);
      fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
      console.log(`📁 Data backed up to: ${backupFile}`);
      
      // Reset setiap lokasi ke kapasitas penuh
      let resetCount = 0;
      data.locations.forEach(location => {
        ['bus', 'mobil', 'motor'].forEach(vehicleType => {
          if (location[vehicleType]) {
            const total = location[vehicleType].total || 0;
            if (total > 0) {
              location[vehicleType].available = total;
              location[vehicleType].last_update = new Date().toISOString();
              location[vehicleType].updated_by = 'emergency-reset';
              location[vehicleType].status = 'empty';
              resetCount++;
            }
          }
        });
      });
      
      // Update statistics
      const stats = this.calculateStatistics(data.locations);
      data.statistics = {
        ...data.statistics,
        ...stats,
        last_reset: new Date().toISOString(),
        reset_by: 'emergency-recovery.js'
      };
      
      // Update metadata
      data.metadata = {
        ...data.metadata,
        last_updated: new Date().toISOString(),
        updated_by: 'emergency-reset',
        emergency_reset: true
      };
      
      // Simpan data
      fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
      
      console.log(`✅ Reset ${resetCount} vehicle capacities`);
      
      this.logRecovery('reset_to_full_capacity', {
        reset_count: resetCount,
        backup_file: backupFile,
        timestamp: new Date().toISOString()
      });
      
      return {
        success: true,
        reset_count: resetCount,
        backup: backupFile
      };
      
    } catch (error) {
      console.error('❌ Reset failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Hitung statistik
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
   * Pulihkan dari GitHub
   */
  async recoverFromGitHub() {
    console.log('🌐 Attempting recovery from GitHub...');
    
    try {
      // Coba pull dari GitHub
      execSync('git pull', { cwd: this.rootDir, stdio: 'pipe' });
      console.log('✅ Successfully pulled from GitHub');
      
      // Cek apakah data file sekarang valid
      const check = this.checkDataFile();
      if (check.valid) {
        return {
          success: true,
          method: 'git_pull',
          data_status: 'valid'
        };
      } else {
        console.log('⚠️ Data still invalid after git pull, trying other methods');
        return {
          success: false,
          method: 'git_pull',
          data_status: 'invalid'
        };
      }
      
    } catch (error) {
      console.error('❌ GitHub recovery failed:', error.message);
      return {
        success: false,
        method: 'git_pull',
        error: error.message
      };
    }
  }

  /**
   * Jalankan prosedur pemulihan otomatis
   */
  async autoRecover() {
    console.log('🚀 Starting automatic recovery procedure...\n');
    
    // Langkah 1: Cek status data
    const dataStatus = this.checkDataFile();
    console.log('📊 Data Status:', dataStatus.valid ? 'VALID' : 'INVALID');
    
    if (dataStatus.valid) {
      console.log('✅ Data is valid, no recovery needed');
      return {
        needed: false,
        data_status: dataStatus
      };
    }
    
    // Langkah 2: Coba restore dari backup terbaru
    console.log('\n1. Looking for latest backup...');
    const latestBackup = this.getLatestBackup();
    
    if (latestBackup) {
      console.log(`   Found backup: ${latestBackup.file}`);
      console.log(`   Timestamp: ${latestBackup.timestamp.toLocaleString()}`);
      
      try {
        const result = await this.restoreFromBackup(latestBackup.path);
        if (result.success) {
          console.log('   ✅ Restore successful');
          return {
            needed: true,
            method: 'backup_restore',
            success: true,
            backup_used: latestBackup.file
          };
        }
      } catch (error) {
        console.log(`   ❌ Restore failed: ${error.message}`);
      }
    } else {
      console.log('   ❌ No backup found');
    }
    
    // Langkah 3: Coba pulihkan dari GitHub
    console.log('\n2. Attempting GitHub recovery...');
    const gitResult = await this.recoverFromGitHub();
    
    if (gitResult.success) {
      console.log('   ✅ GitHub recovery successful');
      return {
        needed: true,
        method: 'github_recovery',
        success: true
      };
    }
    
    // Langkah 4: Reset ke kapasitas penuh
    console.log('\n3. Resetting to full capacity...');
    const resetResult = this.resetToFullCapacity();
    
    if (resetResult.success) {
      console.log('   ✅ Reset successful');
      return {
        needed: true,
        method: 'capacity_reset',
        success: true,
        reset_count: resetResult.reset_count
      };
    }
    
    // Langkah 5: Buat data darurat
    console.log('\n4. Creating emergency data...');
    const emergencyResult = this.createEmergencyData();
    
    console.log('   ✅ Emergency data created');
    return {
      needed: true,
      method: 'emergency_data',
      success: true,
      emergency: true
    };
  }

  /**
   * Main function
   */
  async run() {
    console.log('🚑 EMERGENCY RECOVERY SYSTEM\n');
    
    const args = process.argv.slice(2);
    
    if (args.includes('--check')) {
      const status = this.checkDataFile();
      console.log('📊 Data File Status:');
      console.log(JSON.stringify(status, null, 2));
      return status;
    }
    
    if (args.includes('--backups')) {
      const backups = this.getLatestBackup();
      if (backups) {
        console.log('📦 Latest backup:');
        console.log(`   File: ${backups.file}`);
        console.log(`   Date: ${backups.timestamp.toLocaleString()}`);
        console.log(`   Path: ${backups.path}`);
      } else {
        console.log('❌ No backups found');
      }
      return backups;
    }
    
    if (args.includes('--reset')) {
      return this.resetToFullCapacity();
    }
    
    if (args.includes('--emergency')) {
      return this.createEmergencyData();
    }
    
    if (args.includes('--restore')) {
      const backupFile = args[args.indexOf('--restore') + 1];
      if (backupFile) {
        const backupPath = path.isAbsolute(backupFile) ? backupFile : path.join(this.backupDir, backupFile);
        return this.restoreFromBackup(backupPath);
      } else {
        const latest = this.getLatestBackup();
        if (latest) {
          return this.restoreFromBackup(latest.path);
        } else {
          console.error('❌ No backup specified and no latest backup found');
          return { success: false, error: 'No backup available' };
        }
      }
    }
    
    // Default: auto recover
    return this.autoRecover();
  }
}

// Run if called directly
if (require.main === module) {
  const recovery = new EmergencyRecovery();
  recovery.run().catch(console.error);
}

module.exports = EmergencyRecovery;
