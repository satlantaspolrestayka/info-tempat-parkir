#!/usr/bin/env node
/**
 * Script untuk sinkronisasi konfigurasi dengan data
 */

const fs = require('fs');
const path = require('path');

class ConfigSyncer {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.configFile = path.join(this.rootDir, 'config/locations-config.json');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.vehicleTypesFile = path.join(this.rootDir, 'config/vehicle-types.json');
    this.settingsFile = path.join(this.rootDir, 'config/system-settings.json');
    
    this.backupDir = path.join(this.rootDir, 'data/backups');
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Backup file sebelum sync
   */
  backupFile(filePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = path.basename(filePath);
    const backupFile = path.join(this.backupDir, `pre-sync-${fileName}-${timestamp}.json`);
    
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      fs.writeFileSync(backupFile, content);
      return backupFile;
    }
    
    return null;
  }

  /**
   * Load JSON file dengan error handling
   */
  loadJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`❌ Error loading ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Sync dari config ke data (update data berdasarkan config)
   */
  async syncConfigToData() {
    console.log('🔄 Syncing configuration to data...');
    
    // Backup files
    const dataBackup = this.backupFile(this.dataFile);
    console.log(`📁 Data backup: ${dataBackup}`);
    
    // Load files
    const config = this.loadJsonFile(this.configFile);
    const data = this.loadJsonFile(this.dataFile);
    
    if (!config || !data) {
      console.error('❌ Failed to load required files');
      return { success: false, error: 'File loading failed' };
    }
    
    const updates = [];
    const errors = [];
    
    // Update metadata
    data.metadata = {
      ...data.metadata,
      last_config_sync: new Date().toISOString(),
      config_version: config.version,
      sync_type: 'config_to_data'
    };
    
    // Sync each location
    config.locations.forEach(configLoc => {
      const dataLoc = data.locations.find(l => l.nama === configLoc.name);
      
      if (!dataLoc) {
        errors.push(`Location ${configLoc.name} not found in data`);
        return;
      }
      
      // Update basic info
      const locationUpdates = [];
      
      if (dataLoc.alamat !== configLoc.address) {
        locationUpdates.push(`address: ${dataLoc.alamat} → ${configLoc.address}`);
        dataLoc.alamat = configLoc.address;
      }
      
      if (dataLoc.koordinat !== configLoc.coordinates) {
        locationUpdates.push(`coordinates: ${dataLoc.koordinat} → ${configLoc.coordinates}`);
        dataLoc.koordinat = configLoc.coordinates;
      }
      
      if (dataLoc.status !== configLoc.status) {
        locationUpdates.push(`status: ${dataLoc.status} → ${configLoc.status}`);
        dataLoc.status = configLoc.status;
      }
      
      // Update capacities
      ['bus', 'mobil', 'motor'].forEach(vehicleType => {
        const configCapacity = configLoc.capacity[vehicleType]?.total || 0;
        const dataTotal = dataLoc[vehicleType]?.total || 0;
        
        if (configCapacity !== dataTotal) {
          locationUpdates.push(`${vehicleType} capacity: ${dataTotal} → ${configCapacity}`);
          
          // Initialize vehicle object if it doesn't exist
          if (!dataLoc[vehicleType]) {
            dataLoc[vehicleType] = {
              total: 0,
              available: 0,
              last_update: new Date().toISOString(),
              updated_by: 'system',
              status: 'empty'
            };
          }
          
          // Update total capacity
          dataLoc[vehicleType].total = configCapacity;
          
          // Adjust available if it exceeds new total
          if (dataLoc[vehicleType].available > configCapacity) {
            locationUpdates.push(`${vehicleType} available adjusted: ${dataLoc[vehicleType].available} → ${configCapacity}`);
            dataLoc[vehicleType].available = configCapacity;
          }
          
          // Update status
          if (configCapacity === 0) {
            dataLoc[vehicleType].status = 'not_available';
          } else if (dataLoc[vehicleType].available === configCapacity) {
            dataLoc[vehicleType].status = 'empty';
          } else if (dataLoc[vehicleType].available === 0) {
            dataLoc[vehicleType].status = 'full';
          } else {
            dataLoc[vehicleType].status = 'available';
          }
        }
      });
      
      // Update operational hours if different
      if (dataLoc.operational_hours !== configLoc.operational_hours) {
        locationUpdates.push(`operational_hours: ${dataLoc.operational_hours} → ${configLoc.operational_hours}`);
        dataLoc.operational_hours = configLoc.operational_hours;
      }
      
      // Add sync metadata
      dataLoc.last_config_sync = new Date().toISOString();
      dataLoc.config_version = config.version;
      
      if (locationUpdates.length > 0) {
        updates.push({
          location: configLoc.name,
          updates: locationUpdates
        });
      }
    });
    
    // Recalculate statistics
    const stats = this.calculateStatistics(data.locations);
    data.statistics = {
      ...data.statistics,
      ...stats,
      last_recalculated: new Date().toISOString(),
      recalculated_by: 'sync-config.js'
    };
    
    // Save updated data
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
    
    // Log results
    console.log('\n📊 SYNC RESULTS:');
    console.log(`✅ Updated ${updates.length} locations`);
    console.log(`❌ ${errors.length} errors`);
    
    if (updates.length > 0) {
      console.log('\n📋 Location Updates:');
      updates.forEach(update => {
        console.log(`\n📍 ${update.location}:`);
        update.updates.forEach(u => console.log(`   • ${u}`));
      });
    }
    
    if (errors.length > 0) {
      console.log('\n🚨 Errors:');
      errors.forEach(error => console.log(`   • ${error}`));
    }
    
    console.log(`\n📈 Updated Statistics:`);
    console.log(`   Bus: ${stats.total_available_bus}/${stats.total_bus_capacity}`);
    console.log(`   Mobil: ${stats.total_available_mobil}/${stats.total_mobil_capacity}`);
    console.log(`   Motor: ${stats.total_available_motor}/${stats.total_motor_capacity}`);
    
    return {
      success: errors.length === 0,
      updates: updates.length,
      errors: errors.length,
      backup: dataBackup,
      statistics: stats
    };
  }

  /**
   * Sync dari data ke config (update config berdasarkan data)
   */
  async syncDataToConfig() {
    console.log('🔄 Syncing data to configuration...');
    
    // Backup config file
    const configBackup = this.backupFile(this.configFile);
    console.log(`📁 Config backup: ${configBackup}`);
    
    // Load files
    const config = this.loadJsonFile(this.configFile);
    const data = this.loadJsonFile(this.dataFile);
    
    if (!config || !data) {
      console.error('❌ Failed to load required files');
      return { success: false, error: 'File loading failed' };
    }
    
    const updates = [];
    const errors = [];
    
    // Update config version
    config.last_sync_from_data = new Date().toISOString();
    config.data_version = data.metadata?.version;
    
    // Check for new locations in data
    data.locations.forEach(dataLoc => {
      const configLoc = config.locations.find(l => l.name === dataLoc.nama);
      
      if (!configLoc) {
        // Location exists in data but not in config
        errors.push(`Location ${dataLoc.nama} exists in data but not in config`);
        return;
      }
      
      // Update capacities if data has different values
      ['bus', 'mobil', 'motor'].forEach(vehicleType => {
        const dataTotal = dataLoc[vehicleType]?.total || 0;
        const configCapacity = configLoc.capacity[vehicleType]?.total || 0;
        
        if (dataTotal !== configCapacity) {
          updates.push(`${configLoc.name} ${vehicleType}: config ${configCapacity} → ${dataTotal}`);
          configLoc.capacity[vehicleType].total = dataTotal;
        }
      });
    });
    
    // Recalculate total capacities
    const totals = this.calculateTotalCapacities(config.locations);
    config.total_capacity = totals;
    
    // Save updated config
    fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
    
    // Log results
    console.log('\n📊 SYNC RESULTS (Data → Config):');
    console.log(`✅ Updated ${updates.length} items in config`);
    console.log(`❌ ${errors.length} errors`);
    
    if (updates.length > 0) {
      console.log('\n📋 Config Updates:');
      updates.forEach(update => console.log(`   • ${update}`));
    }
    
    if (errors.length > 0) {
      console.log('\n🚨 Errors:');
      errors.forEach(error => console.log(`   • ${error}`));
    }
    
    console.log(`\n📈 Updated Total Capacities:`);
    console.log(`   Bus: ${totals.bus}`);
    console.log(`   Mobil: ${totals.mobil}`);
    console.log(`   Motor: ${totals.motor}`);
    console.log(`   Total: ${totals.total}`);
    
    return {
      success: errors.length === 0,
      updates: updates.length,
      errors: errors.length,
      backup: configBackup,
      totals
    };
  }

  /**
   * Hitung statistik dari data lokasi
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
   * Hitung total kapasitas dari config
   */
  calculateTotalCapacities(locations) {
    return locations.reduce((totals, location) => {
      totals.bus += location.capacity.bus.total || 0;
      totals.mobil += location.capacity.mobil.total || 0;
      totals.motor += location.capacity.motor.total || 0;
      totals.total += (location.capacity.bus.total || 0) + 
                     (location.capacity.mobil.total || 0) + 
                     (location.capacity.motor.total || 0);
      return totals;
    }, { bus: 0, mobil: 0, motor: 0, total: 0 });
  }

  /**
   * Sync all configurations
   */
  async syncAll() {
    console.log('🔄 Starting full configuration sync...\n');
    
    // Step 1: Sync config to data
    console.log('Step 1: Config → Data');
    const step1 = await this.syncConfigToData();
    
    if (!step1.success) {
      console.error('❌ Step 1 failed');
      return { success: false, step1 };
    }
    
    // Step 2: Sync data to config (bidirectional)
    console.log('\nStep 2: Data → Config');
    const step2 = await this.syncDataToConfig();
    
    return {
      success: step1.success && step2.success,
      steps: {
        config_to_data: step1,
        data_to_config: step2
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Validate sync consistency
   */
  validateSync() {
    console.log('🔍 Validating sync consistency...');
    
    const config = this.loadJsonFile(this.configFile);
    const data = this.loadJsonFile(this.dataFile);
    
    if (!config || !data) {
      return { valid: false, error: 'Files not found' };
    }
    
    const inconsistencies = [];
    
    // Check location count
    if (config.locations.length !== data.locations.length) {
      inconsistencies.push(`Location count mismatch: config=${config.locations.length}, data=${data.locations.length}`);
    }
    
    // Check each location
    config.locations.forEach(configLoc => {
      const dataLoc = data.locations.find(l => l.nama === configLoc.name);
      
      if (!dataLoc) {
        inconsistencies.push(`Location ${configLoc.name} missing in data`);
        return;
      }
      
      // Check capacities
      ['bus', 'mobil', 'motor'].forEach(vehicleType => {
        const configCapacity = configLoc.capacity[vehicleType]?.total || 0;
        const dataTotal = dataLoc[vehicleType]?.total || 0;
        
        if (configCapacity !== dataTotal) {
          inconsistencies.push(`${configLoc.name} ${vehicleType}: config=${configCapacity}, data=${dataTotal}`);
        }
      });
      
      // Check address
      if (configLoc.address !== dataLoc.alamat) {
        inconsistencies.push(`${configLoc.name} address mismatch`);
      }
      
      // Check coordinates
      if (configLoc.coordinates !== dataLoc.koordinat) {
        inconsistencies.push(`${configLoc.name} coordinates mismatch`);
      }
    });
    
    // Check total capacities
    const configTotal = config.total_capacity;
    const dataStats = data.statistics;
    
    if (configTotal.bus !== dataStats.total_bus_capacity) {
      inconsistencies.push(`Bus total capacity mismatch: config=${configTotal.bus}, data=${dataStats.total_bus_capacity}`);
    }
    
    if (configTotal.mobil !== dataStats.total_mobil_capacity) {
      inconsistencies.push(`Mobil total capacity mismatch: config=${configTotal.mobil}, data=${dataStats.total_mobil_capacity}`);
    }
    
    if (configTotal.motor !== dataStats.total_motor_capacity) {
      inconsistencies.push(`Motor total capacity mismatch: config=${configTotal.motor}, data=${dataStats.total_motor_capacity}`);
    }
    
    const valid = inconsistencies.length === 0;
    
    console.log(`\n📊 VALIDATION RESULTS:`);
    console.log(`✅ Status: ${valid ? 'CONSISTENT' : 'INCONSISTENT'}`);
    console.log(`🔍 Inconsistencies found: ${inconsistencies.length}`);
    
    if (!valid) {
      console.log('\n🚨 Inconsistencies:');
      inconsistencies.forEach((issue, index) => {
        console.log(`${index + 1}. ${issue}`);
      });
    }
    
    return {
      valid,
      inconsistencies,
      total_checked: config.locations.length,
      config_version: config.version,
      data_version: data.metadata?.version
    };
  }

  /**
   * Main function
   */
  async run() {
    const args = process.argv.slice(2);
    
    if (args.includes('--config-to-data')) {
      return this.syncConfigToData();
    }
    
    if (args.includes('--data-to-config')) {
      return this.syncDataToConfig();
    }
    
    if (args.includes('--validate')) {
      return this.validateSync();
    }
    
    // Default: full sync
    return this.syncAll();
  }
}

// Run if called directly
if (require.main === module) {
  const syncer = new ConfigSyncer();
  syncer.run().catch(console.error);
}

module.exports = ConfigSyncer;
