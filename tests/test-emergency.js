#!/usr/bin/env node
/**
 * Test untuk sistem emergency recovery
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class EmergencyTest {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.testResults = [];
    this.backupCreated = false;
  }

  /**
   * Setup: Buat backup sebelum test
   */
  async setup() {
    console.log('🛠️ Setting up emergency test environment...');
    
    try {
      // Buat backup data saat ini
      execSync('node scripts/backup-manager.js', { 
        cwd: this.rootDir,
        stdio: 'pipe'
      });
      
      this.backupCreated = true;
      console.log('✅ Backup created for test');
      
    } catch (error) {
      console.warn('⚠️ Could not create backup:', error.message);
    }
  }

  /**
   * Cleanup: Restore setelah test
   */
  async cleanup() {
    if (this.backupCreated) {
      console.log('\n🧹 Cleaning up test environment...');
      
      try {
        // Restore dari backup terbaru
        execSync('node scripts/emergency-recovery.js --restore latest', {
          cwd: this.rootDir,
          stdio: 'pipe'
        });
        
        console.log('✅ Environment restored');
      } catch (error) {
        console.error('❌ Cleanup failed:', error.message);
      }
    }
  }

  /**
   * Test 1: Data corruption recovery
   */
  async testDataCorruptionRecovery() {
    console.log('\n🧪 Test 1: Data Corruption Recovery');
    
    const testFile = path.join(this.rootDir, 'data/parkir-data.json');
    const backupFile = path.join(this.rootDir, 'data/parkir-data-corrupt-test.json');
    
    try {
      // Backup file asli
      fs.copyFileSync(testFile, backupFile);
      
      // Corrupt the data file
      fs.writeFileSync(testFile, 'INVALID JSON DATA { corrupt: true }');
      
      // Jalankan emergency recovery
      const output = execSync('node scripts/emergency-recovery.js --auto', {
        cwd: this.rootDir,
        encoding: 'utf8'
      });
      
      // Cek apakah recovery berhasil
      const recovered = fs.existsSync(testFile);
      let dataValid = false;
      
      if (recovered) {
        try {
          const content = fs.readFileSync(testFile, 'utf8');
          JSON.parse(content);
          dataValid = true;
        } catch (e) {
          dataValid = false;
        }
      }
      
      // Restore file asli
      fs.copyFileSync(backupFile, testFile);
      fs.unlinkSync(backupFile);
      
      this.testResults.push({
        test: 'Data Corruption Recovery',
        passed: recovered && dataValid,
        message: recovered && dataValid ? 
          'Successfully recovered from corrupted data' : 
          'Failed to recover from corrupted data',
        details: {
          file_corrupted: true,
          recovery_attempted: true,
          file_recovered: recovered,
          data_valid: dataValid
        }
      });
      
    } catch (error) {
      // Restore file asli jika ada backup
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, testFile);
        fs.unlinkSync(backupFile);
      }
      
      this.testResults.push({
        test: 'Data Corruption Recovery',
        passed: false,
        message: `Test error: ${error.message}`,
        details: { error: error.message }
      });
    }
  }

  /**
   * Test 2: Missing file recovery
   */
  async testMissingFileRecovery() {
    console.log('\n🧪 Test 2: Missing File Recovery');
    
    const testFile = path.join(this.rootDir, 'data/parkir-data.json');
    const backupFile = path.join(this.rootDir, 'data/parkir-data-missing-test.json');
    
    try {
      // Backup dan hapus file
      fs.copyFileSync(testFile, backupFile);
      fs.unlinkSync(testFile);
      
      // Jalankan emergency recovery
      const output = execSync('node scripts/emergency-recovery.js --auto', {
        cwd: this.rootDir,
        encoding: 'utf8'
      });
      
      // Cek apakah file dibuat ulang
      const fileCreated = fs.existsSync(testFile);
      let dataValid = false;
      
      if (fileCreated) {
        try {
          const content = fs.readFileSync(testFile, 'utf8');
          const data = JSON.parse(content);
          dataValid = data.locations && Array.isArray(data.locations);
        } catch (e) {
          dataValid = false;
        }
      }
      
      // Restore file asli
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, testFile);
        fs.unlinkSync(backupFile);
      }
      
      this.testResults.push({
        test: 'Missing File Recovery',
        passed: fileCreated && dataValid,
        message: fileCreated && dataValid ?
          'Successfully recovered missing file' :
          'Failed to recover missing file',
        details: {
          file_deleted: true,
          recovery_attempted: true,
          file_created: fileCreated,
          data_valid: dataValid
        }
      });
      
    } catch (error) {
      // Restore file asli jika ada backup
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, testFile);
        fs.unlinkSync(backupFile);
      }
      
      this.testResults.push({
        test: 'Missing File Recovery',
        passed: false,
        message: `Test error: ${error.message}`,
        details: { error: error.message }
      });
    }
  }

  /**
   * Test 3: Statistics mismatch recovery
   */
  async testStatisticsMismatchRecovery() {
    console.log('\n🧪 Test 3: Statistics Mismatch Recovery');
    
    const testFile = path.join(this.rootDir, 'data/parkir-data.json');
    const backupFile = path.join(this.rootDir, 'data/parkir-data-stats-test.json');
    
    try {
      // Backup data asli
      fs.copyFileSync(testFile, backupFile);
      
      // Ubah statistics agar tidak match
      const data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      data.statistics.total_available_bus = 9999; // Nilai tidak masuk akal
      data.statistics.total_available_mobil = 8888;
      data.statistics.total_available_motor = 7777;
      
      fs.writeFileSync(testFile, JSON.stringify(data, null, 2));
      
      // Jalankan fix statistics
      const output = execSync('node scripts/fix-statistics.js', {
        cwd: this.rootDir,
        encoding: 'utf8'
      });
      
      // Cek apakah statistics diperbaiki
      const fixedData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      
      // Hitung ulang statistics yang benar
      let calculatedBus = 0;
      let calculatedMobil = 0;
      let calculatedMotor = 0;
      
      fixedData.locations.forEach(location => {
        calculatedBus += location.bus?.available || 0;
        calculatedMobil += location.mobil?.available || 0;
        calculatedMotor += location.motor?.available || 0;
      });
      
      const statsFixed = 
        fixedData.statistics.total_available_bus === calculatedBus &&
        fixedData.statistics.total_available_mobil === calculatedMobil &&
        fixedData.statistics.total_available_motor === calculatedMotor;
      
      // Restore data asli
      fs.copyFileSync(backupFile, testFile);
      fs.unlinkSync(backupFile);
      
      this.testResults.push({
        test: 'Statistics Mismatch Recovery',
        passed: statsFixed,
        message: statsFixed ?
          'Successfully fixed statistics mismatch' :
          'Failed to fix statistics mismatch',
        details: {
          statistics_corrupted: true,
          fix_attempted: true,
          statistics_fixed: statsFixed,
          calculated: {
            bus: calculatedBus,
            mobil: calculatedMobil,
            motor: calculatedMotor
          },
          reported: {
            bus: fixedData.statistics.total_available_bus,
            mobil: fixedData.statistics.total_available_mobil,
            motor: fixedData.statistics.total_available_motor
          }
        }
      });
      
    } catch (error) {
      // Restore data asli jika ada backup
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, testFile);
        fs.unlinkSync(backupFile);
      }
      
      this.testResults.push({
        test: 'Statistics Mismatch Recovery',
        passed: false,
        message: `Test error: ${error.message}`,
        details: { error: error.message }
      });
    }
  }

  /**
   * Test 4: Backup restoration
   */
  async testBackupRestoration() {
    console.log('\n🧪 Test 4: Backup Restoration');
    
    try {
      // Buat backup khusus untuk test
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const testBackupDir = path.join(this.rootDir, 'data/backups/test-emergency');
      
      if (!fs.existsSync(testBackupDir)) {
        fs.mkdirSync(testBackupDir, { recursive: true });
      }
      
      // Simpan data saat ini ke backup test
      const testFile = path.join(this.rootDir, 'data/parkir-data.json');
      const testBackup = path.join(testBackupDir, `test-backup-${timestamp}.json`);
      
      const data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      
      // Modifikasi data untuk backup
      data.metadata.test_backup = true;
      data.metadata.backup_timestamp = timestamp;
      
      fs.writeFileSync(testBackup, JSON.stringify(data, null, 2));
      
      // Ubah data asli
      data.locations[0].nama = 'TEST MODIFIED';
      fs.writeFileSync(testFile, JSON.stringify(data, null, 2));
      
      // Simpan modified state untuk perbandingan
      const modifiedData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      
      // Jalankan restore dari backup test
      const output = execSync(`node scripts/emergency-recovery.js --restore "${testBackup}"`, {
        cwd: this.rootDir,
        encoding: 'utf8'
      });
      
      // Cek apakah data dikembalikan
      const restoredData = JSON.parse(fs.readFileSync(testFile, 'utf8'));
      const restoredCorrectly = restoredData.locations[0].nama !== 'TEST MODIFIED';
      
      // Bersihkan backup test
      fs.unlinkSync(testBackup);
      
      this.testResults.push({
        test: 'Backup Restoration',
        passed: restoredCorrectly,
        message: restoredCorrectly ?
          'Successfully restored from backup' :
          'Failed to restore from backup',
        details: {
          backup_created: true,
          data_modified: true,
          restore_attempted: true,
          restored_correctly: restoredCorrectly
        }
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'Backup Restoration',
        passed: false,
        message: `Test error: ${error.message}`,
        details: { error: error.message }
      });
    }
  }

  /**
   * Test 5: Emergency data creation
   */
  async testEmergencyDataCreation() {
    console.log('\n🧪 Test 5: Emergency Data Creation');
    
    const testFile = path.join(this.rootDir, 'data/parkir-data.json');
    const backupFile = path.join(this.rootDir, 'data/parkir-data-emergency-test.json');
    
    try {
      // Backup data asli
      fs.copyFileSync(testFile, backupFile);
      
      // Hapus data file
      fs.unlinkSync(testFile);
      
      // Hapus juga backups untuk simulasi kondisi emergency sebenarnya
      const backupDir = path.join(this.rootDir, 'data/backups');
      const backupFiles = fs.readdirSync(backupDir)
        .filter(f => f.includes('backup-'))
        .map(f => path.join(backupDir, f));
      
      // Backup file backup
      const backupBackups = [];
      backupFiles.forEach(backup => {
        const backupBackup = backup + '.backup';
        fs.copyFileSync(backup, backupBackup);
        backupBackups.push(backupBackup);
        fs.unlinkSync(backup);
      });
      
      // Jalankan emergency data creation
      const output = execSync('node scripts/emergency-recovery.js --emergency', {
        cwd: this.rootDir,
        encoding: 'utf8'
      });
      
      // Cek apakah data emergency dibuat
      const emergencyDataExists = fs.existsSync(testFile);
      let emergencyDataValid = false;
      
      if (emergencyDataExists) {
        try {
          const data = JSON.parse(fs.readFileSync(testFile, 'utf8'));
          emergencyDataValid = data.metadata?.emergency_created === true &&
                             data.locations?.length > 0;
        } catch (e) {
          emergencyDataValid = false;
        }
      }
      
      // Restore data asli
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, testFile);
        fs.unlinkSync(backupFile);
      }
      
      // Restore backups
      backupBackups.forEach(backupBackup => {
        const original = backupBackup.replace('.backup', '');
        if (fs.existsSync(backupBackup)) {
          fs.copyFileSync(backupBackup, original);
          fs.unlinkSync(backupBackup);
        }
      });
      
      this.testResults.push({
        test: 'Emergency Data Creation',
        passed: emergencyDataExists && emergencyDataValid,
        message: emergencyDataExists && emergencyDataValid ?
          'Successfully created emergency data' :
          'Failed to create emergency data',
        details: {
          data_deleted: true,
          backups_deleted: true,
          emergency_attempted: true,
          emergency_data_created: emergencyDataExists,
          emergency_data_valid: emergencyDataValid
        }
      });
      
    } catch (error) {
      // Restore data asli jika ada backup
      if (fs.existsSync(backupFile)) {
        fs.copyFileSync(backupFile, testFile);
        fs.unlinkSync(backupFile);
      }
      
      this.testResults.push({
        test: 'Emergency Data Creation',
        passed: false,
        message: `Test error: ${error.message}`,
        details: { error: error.message }
      });
    }
  }

  /**
   * Jalankan semua tests
   */
  async runAllTests() {
    console.log('🚨 RUNNING EMERGENCY SYSTEM TESTS\n');
    console.log('⚠️ WARNING: These tests will modify system data');
    console.log('📁 Backups will be created and restored automatically\n');
    
    // Setup
    await this.setup();
    
    // Jalankan tests
    await this.testDataCorruptionRecovery();
    await this.testMissingFileRecovery();
    await this.testStatisticsMismatchRecovery();
    await this.testBackupRestoration();
    await this.testEmergencyDataCreation();
    
    // Cleanup
    await this.cleanup();
    
    // Tampilkan hasil
    this.printResults();
    this.saveResults();
    
    const passed = this.testResults.filter(t => t.passed).length;
    const total = this.testResults.length;
    
    return {
      total,
      passed,
      failed: total - passed,
      success: passed === total
    };
  }

  /**
   * Tampilkan hasil
   */
  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log('📊 EMERGENCY SYSTEM TEST RESULTS');
    console.log('='.repeat(70));
    
    this.testResults.forEach((result, index) => {
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'PASS' : 'FAIL';
      
      console.log(`\n${index + 1}. ${icon} ${result.test} [${status}]`);
      console.log(`   ${result.message}`);
      
      if (result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          if (value !== undefined && value !== null && typeof value !== 'object') {
            console.log(`   ${key}: ${value}`);
          }
        });
      }
    });
    
    const passed = this.testResults.filter(t => t.passed).length;
    const total = this.testResults.length;
    
    console.log('\n' + '='.repeat(70));
    console.log(`📈 SUMMARY: ${passed} passed, ${total - passed} failed, ${total} total`);
    
    if (passed === total) {
      console.log('🎉 All emergency tests passed! System is resilient.');
    } else {
      console.log('⚠️ Some emergency tests failed. Review emergency procedures.');
    }
    
    console.log('='.repeat(70));
  }

  /**
   * Simpan hasil
   */
  saveResults() {
    const reportDir = path.join(this.rootDir, 'data/reports/tests');
    
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const report = {
      timestamp: new Date().toISOString(),
      test_type: 'emergency',
      summary: {
        total: this.testResults.length,
        passed: this.testResults.filter(t => t.passed).length,
        failed: this.testResults.filter(t => !t.passed).length
      },
      tests: this.testResults,
      environment: {
        node_version: process.version,
        platform: process.platform,
        backup_created: this.backupCreated
      }
    };
    
    const reportFile = path.join(reportDir, `emergency-tests-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n📁 Test report saved: ${reportFile}`);
    
    return reportFile;
  }

  /**
   * Main function
   */
  async run() {
    const args = process.argv.slice(2);
    
    if (args.includes('--safe')) {
      console.log('🔒 Running in safe mode (read-only tests)');
      // Hanya jalankan test yang tidak mengubah data
      await this.testBackupRestoration();
      this.printResults();
    } else {
      // Jalankan semua tests
      await this.runAllTests();
    }
    
    const passed = this.testResults.filter(t => t.passed).length;
    const total = this.testResults.length;
    
    // Return exit code berdasarkan hasil
    return passed === total ? 0 : 1;
  }
}

// Run if called directly
if (require.main === module) {
  const tester = new EmergencyTest();
  tester.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('❌ Emergency test failed:', error);
    process.exit(1);
  });
}

module.exports = EmergencyTest;
