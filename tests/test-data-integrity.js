#!/usr/bin/env node
/**
 * Test untuk integritas data sistem parkir
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

class DataIntegrityTest {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.testResults = [];
    this.passed = 0;
    this.failed = 0;
  }

  /**
   * Tambahkan hasil test
   */
  addResult(testName, passed, message, details = {}) {
    this.testResults.push({
      testName,
      passed,
      message,
      details,
      timestamp: new Date().toISOString()
    });
    
    if (passed) {
      this.passed++;
    } else {
      this.failed++;
    }
  }

  /**
   * Test 1: Validasi struktur file konfigurasi
   */
  testConfigStructure() {
    const testName = 'Config Structure Validation';
    
    try {
      const configPath = path.join(this.rootDir, 'config/locations-config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      // Validasi struktur
      assert.ok(config.version, 'Config must have version');
      assert.ok(config.locations, 'Config must have locations array');
      assert.ok(Array.isArray(config.locations), 'Locations must be an array');
      assert.ok(config.total_capacity, 'Config must have total_capacity');
      
      // Validasi setiap lokasi
      config.locations.forEach((location, index) => {
        assert.ok(location.id, `Location ${index} must have id`);
        assert.ok(location.code, `Location ${index} must have code`);
        assert.ok(location.name, `Location ${index} must have name`);
        assert.ok(location.address, `Location ${index} must have address`);
        assert.ok(location.coordinates, `Location ${index} must have coordinates`);
        assert.ok(location.capacity, `Location ${index} must have capacity`);
        assert.ok(location.operational_hours, `Location ${index} must have operational_hours`);
      });
      
      this.addResult(testName, true, 'Config structure is valid', {
        total_locations: config.locations.length,
        version: config.version
      });
      
    } catch (error) {
      this.addResult(testName, false, `Config structure invalid: ${error.message}`);
    }
  }

  /**
   * Test 2: Validasi struktur data parkir
   */
  testDataStructure() {
    const testName = 'Data Structure Validation';
    
    try {
      const dataPath = path.join(this.rootDir, 'data/parkir-data.json');
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // Validasi metadata
      assert.ok(data.metadata, 'Data must have metadata');
      assert.ok(data.metadata.last_updated, 'Metadata must have last_updated');
      assert.ok(data.metadata.version, 'Metadata must have version');
      assert.ok(data.metadata.total_locations, 'Metadata must have total_locations');
      
      // Validasi statistics
      assert.ok(data.statistics, 'Data must have statistics');
      assert.ok(typeof data.statistics.total_available_bus === 'number', 'Statistics must have total_available_bus as number');
      assert.ok(typeof data.statistics.total_available_mobil === 'number', 'Statistics must have total_available_mobil as number');
      assert.ok(typeof data.statistics.total_available_motor === 'number', 'Statistics must have total_available_motor as number');
      
      // Validasi locations array
      assert.ok(data.locations, 'Data must have locations array');
      assert.ok(Array.isArray(data.locations), 'Locations must be an array');
      assert.strictEqual(data.locations.length, data.metadata.total_locations, 'Location count must match metadata');
      
      // Validasi setiap lokasi
      data.locations.forEach((location, index) => {
        assert.ok(location.id, `Location ${index} must have id`);
        assert.ok(location.nama, `Location ${index} must have nama`);
        assert.ok(location.alamat, `Location ${index} must have alamat`);
        assert.ok(location.koordinat, `Location ${index} must have koordinat`);
        assert.ok(location.status, `Location ${index} must have status`);
        
        // Validasi data kendaraan
        ['bus', 'mobil', 'motor'].forEach(vehicleType => {
          if (location[vehicleType]) {
            const vehicle = location[vehicleType];
            assert.ok(typeof vehicle.total === 'number', `${vehicleType}.total must be number`);
            assert.ok(typeof vehicle.available === 'number', `${vehicleType}.available must be number`);
            assert.ok(vehicle.available <= vehicle.total, `${vehicleType}.available cannot exceed total`);
            assert.ok(vehicle.available >= 0, `${vehicleType}.available cannot be negative`);
          }
        });
      });
      
      this.addResult(testName, true, 'Data structure is valid', {
        total_locations: data.locations.length,
        last_updated: data.metadata.last_updated
      });
      
    } catch (error) {
      this.addResult(testName, false, `Data structure invalid: ${error.message}`);
    }
  }

  /**
   * Test 3: Konsistensi antara config dan data
   */
  testConfigDataConsistency() {
    const testName = 'Config-Data Consistency';
    
    try {
      const configPath = path.join(this.rootDir, 'config/locations-config.json');
      const dataPath = path.join(this.rootDir, 'data/parkir-data.json');
      
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const inconsistencies = [];
      
      // Periksa jumlah lokasi
      if (config.locations.length !== data.locations.length) {
        inconsistencies.push(`Location count mismatch: config=${config.locations.length}, data=${data.locations.length}`);
      }
      
      // Periksa setiap lokasi
      config.locations.forEach(configLoc => {
        const dataLoc = data.locations.find(l => l.nama === configLoc.name);
        
        if (!dataLoc) {
          inconsistencies.push(`Location ${configLoc.name} not found in data`);
          return;
        }
        
        // Periksa kapasitas
        ['bus', 'mobil', 'motor'].forEach(vehicleType => {
          const configCapacity = configLoc.capacity[vehicleType]?.total || 0;
          const dataTotal = dataLoc[vehicleType]?.total || 0;
          
          if (configCapacity !== dataTotal) {
            inconsistencies.push(`${configLoc.name} ${vehicleType}: config=${configCapacity}, data=${dataTotal}`);
          }
        });
      });
      
      if (inconsistencies.length === 0) {
        this.addResult(testName, true, 'Config and data are consistent', {
          location_count: config.locations.length
        });
      } else {
        this.addResult(testName, false, `Found ${inconsistencies.length} inconsistencies`, {
          inconsistencies,
          total_checked: config.locations.length
        });
      }
      
    } catch (error) {
      this.addResult(testName, false, `Consistency check failed: ${error.message}`);
    }
  }

  /**
   * Test 4: Validasi statistik
   */
  testStatisticsValidation() {
    const testName = 'Statistics Validation';
    
    try {
      const dataPath = path.join(__dirname, '../data/parkir-data.json');
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      // Hitung ulang statistik dari data lokasi
      let calculatedBus = 0;
      let calculatedMobil = 0;
      let calculatedMotor = 0;
      let totalBusCapacity = 0;
      let totalMobilCapacity = 0;
      let totalMotorCapacity = 0;
      
      data.locations.forEach(location => {
        calculatedBus += location.bus?.available || 0;
        calculatedMobil += location.mobil?.available || 0;
        calculatedMotor += location.motor?.available || 0;
        
        totalBusCapacity += location.bus?.total || 0;
        totalMobilCapacity += location.mobil?.total || 0;
        totalMotorCapacity += location.motor?.total || 0;
      });
      
      // Bandingkan dengan statistik yang dilaporkan
      const reportedBus = data.statistics.total_available_bus;
      const reportedMobil = data.statistics.total_available_mobil;
      const reportedMotor = data.statistics.total_available_motor;
      const reportedBusCapacity = data.statistics.total_bus_capacity;
      const reportedMobilCapacity = data.statistics.total_mobil_capacity;
      const reportedMotorCapacity = data.statistics.total_motor_capacity;
      
      const discrepancies = [];
      
      if (calculatedBus !== reportedBus) {
        discrepancies.push(`Bus available: calculated=${calculatedBus}, reported=${reportedBus}`);
      }
      
      if (calculatedMobil !== reportedMobil) {
        discrepancies.push(`Mobil available: calculated=${calculatedMobil}, reported=${reportedMobil}`);
      }
      
      if (calculatedMotor !== reportedMotor) {
        discrepancies.push(`Motor available: calculated=${calculatedMotor}, reported=${reportedMotor}`);
      }
      
      if (totalBusCapacity !== reportedBusCapacity) {
        discrepancies.push(`Bus capacity: calculated=${totalBusCapacity}, reported=${reportedBusCapacity}`);
      }
      
      if (totalMobilCapacity !== reportedMobilCapacity) {
        discrepancies.push(`Mobil capacity: calculated=${totalMobilCapacity}, reported=${reportedMobilCapacity}`);
      }
      
      if (totalMotorCapacity !== reportedMotorCapacity) {
        discrepancies.push(`Motor capacity: calculated=${totalMotorCapacity}, reported=${reportedMotorCapacity}`);
      }
      
      if (discrepancies.length === 0) {
        this.addResult(testName, true, 'Statistics are accurate', {
          bus: `${calculatedBus}/${totalBusCapacity}`,
          mobil: `${calculatedMobil}/${totalMobilCapacity}`,
          motor: `${calculatedMotor}/${totalMotorCapacity}`
        });
      } else {
        this.addResult(testName, false, `Found ${discrepancies.length} statistical discrepancies`, {
          discrepancies,
          calculated: {
            bus: calculatedBus,
            mobil: calculatedMobil,
            motor: calculatedMotor
          },
          reported: {
            bus: reportedBus,
            mobil: reportedMobil,
            motor: reportedMotor
          }
        });
      }
      
    } catch (error) {
      this.addResult(testName, false, `Statistics validation failed: ${error.message}`);
    }
  }

  /**
   * Test 5: Validasi data spesial Kridosono
   */
  testKridosonoSpecialData() {
    const testName = 'Kridosono Special Data';
    
    try {
      const dataPath = path.join(this.rootDir, 'data/parkir-data.json');
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      
      const kridosono = data.locations.find(l => l.nama === 'STADION KRIDOSONO');
      
      if (!kridosono) {
        this.addResult(testName, false, 'Kridosono location not found');
        return;
      }
      
      // Validasi status khusus
      assert.strictEqual(kridosono.status, 'special', 'Kridosono must have special status');
      assert.ok(kridosono.special_operation, 'Kridosono must have special_operation data');
      
      // Validasi periode operasional
      assert.ok(kridosono.special_operation.period1, 'Must have period1 data');
      assert.ok(kridosono.special_operation.period2, 'Must have period2 data');
      
      // Validasi kapasitas harus 0 (karena operasional khusus)
      assert.strictEqual(kridosono.bus.total, 0, 'Bus capacity should be 0 for special operation');
      assert.strictEqual(kridosono.mobil.total, 0, 'Mobil capacity should be 0 for special operation');
      assert.strictEqual(kridosono.motor.total, 0, 'Motor capacity should be 0 for special operation');
      
      this.addResult(testName, true, 'Kridosono special data is valid', {
        status: kridosono.status,
        has_special_operation: true,
        period1: kridosono.special_operation.period1.date,
        period2: kridosono.special_operation.period2.date
      });
      
    } catch (error) {
      this.addResult(testName, false, `Kridosono validation failed: ${error.message}`);
    }
  }

  /**
   * Test 6: Validasi file pending updates
   */
  testPendingUpdates() {
    const testName = 'Pending Updates Validation';
    
    try {
      const updatesPath = path.join(this.rootDir, 'data/pending-updates.json');
      
      if (!fs.existsSync(updatesPath)) {
        this.addResult(testName, true, 'No pending updates file (this is ok)', {
          file_exists: false
        });
        return;
      }
      
      const updates = JSON.parse(fs.readFileSync(updatesPath, 'utf8'));
      
      // Validasi struktur array
      assert.ok(Array.isArray(updates), 'Pending updates must be an array');
      
      // Validasi setiap update
      updates.forEach((update, index) => {
        assert.ok(update.location_id, `Update ${index} must have location_id`);
        assert.ok(update.petugas_name, `Update ${index} must have petugas_name`);
        assert.ok(update.timestamp, `Update ${index} must have timestamp`);
        
        // Validasi data numerik
        if (update.bus !== undefined) {
          assert.ok(typeof update.bus === 'number' || (typeof update.bus === 'string' && !isNaN(update.bus)), 
                   `Update ${index} bus must be number`);
        }
        
        if (update.mobil !== undefined) {
          assert.ok(typeof update.mobil === 'number' || (typeof update.mobil === 'string' && !isNaN(update.mobil)), 
                   `Update ${index} mobil must be number`);
        }
        
        if (update.motor !== undefined) {
          assert.ok(typeof update.motor === 'number' || (typeof update.motor === 'string' && !isNaN(update.motor)), 
                   `Update ${index} motor must be number`);
        }
      });
      
      this.addResult(testName, true, 'Pending updates are valid', {
        total_updates: updates.length,
        has_updates: updates.length > 0
      });
      
    } catch (error) {
      this.addResult(testName, false, `Pending updates validation failed: ${error.message}`);
    }
  }

  /**
   * Test 7: Validasi backup files
   */
  testBackupFiles() {
    const testName = 'Backup Files Validation';
    
    try {
      const backupDir = path.join(this.rootDir, 'data/backups');
      
      if (!fs.existsSync(backupDir)) {
        this.addResult(testName, false, 'Backup directory does not exist');
        return;
      }
      
      const backupFiles = fs.readdirSync(backupDir)
        .filter(file => file.startsWith('backup-') && (file.endsWith('.json') || file.endsWith('.json.gz')));
      
      if (backupFiles.length === 0) {
        this.addResult(testName, true, 'No backup files found (system may be new)', {
          backup_files: 0
        });
        return;
      }
      
      // Periksa file backup terbaru
      const latestFile = path.join(backupDir, 'latest-backup.json');
      if (fs.existsSync(latestFile)) {
        const latestInfo = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
        assert.ok(latestInfo.timestamp, 'Latest backup must have timestamp');
        assert.ok(latestInfo.backup_file, 'Latest backup must have backup_file');
      }
      
      this.addResult(testName, true, 'Backup files are valid', {
        total_backups: backupFiles.length,
        has_latest_file: fs.existsSync(latestFile),
        backup_dir_exists: true
      });
      
    } catch (error) {
      this.addResult(testName, false, `Backup validation failed: ${error.message}`);
    }
  }

  /**
   * Jalankan semua tests
   */
  async runAllTests() {
    console.log('🧪 Running Data Integrity Tests...\n');
    
    // Jalankan semua test
    this.testConfigStructure();
    this.testDataStructure();
    this.testConfigDataConsistency();
    this.testStatisticsValidation();
    this.testKridosonoSpecialData();
    this.testPendingUpdates();
    this.testBackupFiles();
    
    // Tampilkan hasil
    this.printResults();
    
    // Simpan hasil
    this.saveResults();
    
    return {
      total: this.testResults.length,
      passed: this.passed,
      failed: this.failed,
      success: this.failed === 0
    };
  }

  /**
   * Tampilkan hasil test
   */
  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 DATA INTEGRITY TEST RESULTS');
    console.log('='.repeat(70));
    
    this.testResults.forEach((result, index) => {
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'PASS' : 'FAIL';
      
      console.log(`\n${index + 1}. ${icon} ${result.testName} [${status}]`);
      console.log(`   ${result.message}`);
      
      if (result.details && Object.keys(result.details).length > 0) {
        Object.entries(result.details).forEach(([key, value]) => {
          if (key !== 'inconsistencies' && key !== 'discrepancies' && value !== undefined) {
            console.log(`   ${key}: ${value}`);
          }
        });
      }
      
      // Tampilkan inconsistencies jika ada
      if (result.details?.inconsistencies) {
        console.log('   Inconsistencies:');
        result.details.inconsistencies.forEach((issue, i) => {
          console.log(`     ${i + 1}. ${issue}`);
        });
      }
      
      // Tampilkan discrepancies jika ada
      if (result.details?.discrepancies) {
        console.log('   Discrepancies:');
        result.details.discrepancies.forEach((issue, i) => {
          console.log(`     ${i + 1}. ${issue}`);
        });
      }
    });
    
    console.log('\n' + '='.repeat(70));
    console.log(`📈 SUMMARY: ${this.passed} passed, ${this.failed} failed, ${this.testResults.length} total`);
    
    if (this.failed === 0) {
      console.log('🎉 All tests passed! Data integrity is maintained.');
    } else {
      console.log(`🚨 ${this.failed} test(s) failed. Data integrity issues detected.`);
      console.log('   Run fix scripts to correct issues:');
      console.log('   - npm run fix          # Fix statistics');
      console.log('   - npm run sync         # Sync configuration');
      console.log('   - npm run verify       # Verify consistency');
    }
    
    console.log('='.repeat(70));
  }

  /**
   * Simpan hasil test
   */
  saveResults() {
    const reportDir = path.join(this.rootDir, 'data/reports/tests');
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const report = {
      timestamp: new Date().toISOString(),
      summary: {
        total: this.testResults.length,
        passed: this.passed,
        failed: this.failed,
        success: this.failed === 0
      },
      tests: this.testResults,
      recommendations: this.generateRecommendations()
    };
    
    const reportFile = path.join(reportDir, `data-integrity-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n📁 Test report saved: ${reportFile}`);
    
    return reportFile;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    
    // Cek test yang gagal
    const failedTests = this.testResults.filter(t => !t.passed);
    
    failedTests.forEach(test => {
      if (test.testName.includes('Statistics')) {
        recommendations.push('Run fix-statistics.js to correct statistical discrepancies');
      }
      
      if (test.testName.includes('Consistency')) {
        recommendations.push('Run sync-config.js to synchronize configuration and data');
      }
      
      if (test.testName.includes('Structure')) {
        recommendations.push('Review and fix data structure issues');
      }
    });
    
    // Jika ada inconsistencies
    const inconsistencyTests = this.testResults.filter(t => 
      t.details?.inconsistencies && t.details.inconsistencies.length > 0
    );
    
    if (inconsistencyTests.length > 0) {
      recommendations.push('Run verify-consistency.js for detailed inconsistency report');
    }
    
    return recommendations;
  }

  /**
   * Main function
   */
  async run() {
    const args = process.argv.slice(2);
    
    if (args.includes('--quick')) {
      console.log('🚀 Running quick integrity check...');
      // Hanya jalankan test penting
      this.testDataStructure();
      this.testStatisticsValidation();
      this.printResults();
    } else {
      // Jalankan semua test
      await this.runAllTests();
    }
    
    // Return exit code berdasarkan hasil
    return this.failed === 0 ? 0 : 1;
  }
}

// Run if called directly
if (require.main === module) {
  const test = new DataIntegrityTest();
  test.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = DataIntegrityTest;
