#!/usr/bin/env node
/**
 * Script untuk verifikasi konsistensi antara config dan data
 */

const fs = require('fs');
const path = require('path');

class ConsistencyVerifier {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.configFile = path.join(this.rootDir, 'config/locations-config.json');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.reportDir = path.join(this.rootDir, 'data/reports');
    
    // Ensure report directory exists
    if (!fs.existsSync(this.reportDir)) {
      fs.mkdirSync(this.reportDir, { recursive: true });
    }
  }

  /**
   * Load JSON file dengan error handling
   */
  loadJsonFile(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`❌ Error loading ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Verifikasi struktur dasar
   */
  verifyStructure(config, data) {
    const issues = [];

    // Check config structure
    if (!config.locations || !Array.isArray(config.locations)) {
      issues.push('Config: Missing or invalid locations array');
    }

    if (!config.total_capacity) {
      issues.push('Config: Missing total_capacity');
    }

    // Check data structure
    if (!data.locations || !Array.isArray(data.locations)) {
      issues.push('Data: Missing or invalid locations array');
    }

    if (!data.statistics) {
      issues.push('Data: Missing statistics');
    }

    // Check metadata
    if (!data.metadata) {
      issues.push('Data: Missing metadata');
    }

    return issues;
  }

  /**
   * Verifikasi jumlah lokasi
   */
  verifyLocationCount(config, data) {
    const configCount = config.locations?.length || 0;
    const dataCount = data.locations?.length || 0;

    if (configCount !== dataCount) {
      return {
        passed: false,
        message: `Location count mismatch: Config has ${configCount}, Data has ${dataCount}`
      };
    }

    return {
      passed: true,
      message: `Location count matches: ${configCount} locations`
    };
  }

  /**
   * Verifikasi setiap lokasi individual
   */
  verifyIndividualLocations(config, data) {
    const issues = [];

    // Create maps for easier lookup
    const configMap = {};
    config.locations.forEach(loc => {
      configMap[loc.code] = loc;
    });

    const dataMap = {};
    data.locations.forEach(loc => {
      dataMap[loc.nama] = loc;
    });

    // Check each config location exists in data
    config.locations.forEach(configLoc => {
      const dataLoc = dataMap[configLoc.name];

      if (!dataLoc) {
        issues.push(`Config location "${configLoc.name}" not found in data`);
        return;
      }

      // Check capacities
      const capacityChecks = this.verifyLocationCapacity(configLoc, dataLoc);
      if (capacityChecks.length > 0) {
        issues.push(...capacityChecks);
      }

      // Check coordinates
      if (configLoc.coordinates !== dataLoc.koordinat) {
        issues.push(`${configLoc.name}: Coordinates mismatch`);
      }

      // Check address
      if (configLoc.address !== dataLoc.alamat) {
        issues.push(`${configLoc.name}: Address mismatch`);
      }
    });

    return issues;
  }

  /**
   * Verifikasi kapasitas lokasi
   */
  verifyLocationCapacity(configLoc, dataLoc) {
    const issues = [];

    ['bus', 'mobil', 'motor'].forEach(vehicleType => {
      const configCapacity = configLoc.capacity[vehicleType]?.total || 0;
      const dataTotal = dataLoc[vehicleType]?.total || 0;

      if (configCapacity !== dataTotal) {
        issues.push(`${configLoc.name} ${vehicleType}: Capacity mismatch (config: ${configCapacity}, data: ${dataTotal})`);
      }

      // Check available doesn't exceed total
      const dataAvailable = dataLoc[vehicleType]?.available || 0;
      if (dataAvailable > dataTotal) {
        issues.push(`${configLoc.name} ${vehicleType}: Available (${dataAvailable}) exceeds total (${dataTotal})`);
      }
    });

    return issues;
  }

  /**
   * Verifikasi statistik total
   */
  verifyTotalStatistics(config, data) {
    const issues = [];

    // Calculate from config
    const configTotals = config.total_capacity;
    
    // Get from data statistics
    const dataStats = data.statistics;

    // Check bus
    if (configTotals.bus !== dataStats.total_bus_capacity) {
      issues.push(`Bus capacity mismatch: Config ${configTotals.bus}, Data ${dataStats.total_bus_capacity}`);
    }

    // Check mobil
    if (configTotals.mobil !== dataStats.total_mobil_capacity) {
      issues.push(`Mobil capacity mismatch: Config ${configTotals.mobil}, Data ${dataStats.total_mobil_capacity}`);
    }

    // Check motor
    if (configTotals.motor !== dataStats.total_motor_capacity) {
      issues.push(`Motor capacity mismatch: Config ${configTotals.motor}, Data ${dataStats.total_motor_capacity}`);
    }

    // Calculate available from data locations
    let calculatedBus = 0;
    let calculatedMobil = 0;
    let calculatedMotor = 0;

    data.locations.forEach(loc => {
      calculatedBus += loc.bus?.available || 0;
      calculatedMobil += loc.mobil?.available || 0;
      calculatedMotor += loc.motor?.available || 0;
    });

    // Check available statistics
    if (calculatedBus !== dataStats.total_available_bus) {
      issues.push(`Bus available mismatch: Calculated ${calculatedBus}, Reported ${dataStats.total_available_bus}`);
    }

    if (calculatedMobil !== dataStats.total_available_mobil) {
      issues.push(`Mobil available mismatch: Calculated ${calculatedMobil}, Reported ${dataStats.total_available_mobil}`);
    }

    if (calculatedMotor !== dataStats.total_available_motor) {
      issues.push(`Motor available mismatch: Calculated ${calculatedMotor}, Reported ${dataStats.total_available_motor}`);
    }

    return issues;
  }

  /**
   * Verifikasi metadata
   */
  verifyMetadata(data) {
    const issues = [];

    const metadata = data.metadata;

    // Check required fields
    const requiredFields = ['last_updated', 'version', 'total_locations', 'operation_name'];
    requiredFields.forEach(field => {
      if (!metadata[field]) {
        issues.push(`Missing metadata field: ${field}`);
      }
    });

    // Check version format
    if (metadata.version && !/^\d+\.\d+\.\d+$/.test(metadata.version)) {
      issues.push(`Invalid version format: ${metadata.version}`);
    }

    // Check total locations matches actual
    if (metadata.total_locations !== data.locations.length) {
      issues.push(`Metadata total_locations (${metadata.total_locations}) doesn't match actual (${data.locations.length})`);
    }

    return issues;
  }

  /**
   * Generate report
   */
  generateReport(results) {
    const timestamp = new Date().toISOString();
    const reportFile = path.join(this.reportDir, `consistency-report-${timestamp.split('T')[0]}.json`);

    const report = {
      timestamp,
      summary: {
        total_checks: 5,
        passed_checks: results.filter(r => r.passed).length,
        failed_checks: results.filter(r => !r.passed).length,
        total_issues: results.reduce((sum, r) => sum + (r.issues?.length || 0), 0)
      },
      checks: results,
      recommendations: []
    };

    // Add recommendations based on issues
    if (report.summary.failed_checks > 0) {
      report.recommendations.push('Run fix-statistics.js to correct data inconsistencies');
      report.recommendations.push('Review config/locations-config.json for configuration errors');
      report.recommendations.push('Check data/parkir-data.json for data entry errors');
    }

    if (results.some(r => r.name === 'total_statistics' && !r.passed)) {
      report.recommendations.push('Recalculate statistics using fix-statistics.js');
    }

    // Save report
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

    return {
      report,
      reportFile
    };
  }

  /**
   * Print results ke console
   */
  printResults(results, reportInfo) {
    console.log('\n' + '='.repeat(70));
    console.log('🔍 CONSISTENCY VERIFICATION REPORT');
    console.log('='.repeat(70));

    results.forEach((check, index) => {
      const icon = check.passed ? '✅' : '❌';
      console.log(`${icon} ${check.name}`);
      console.log(`   ${check.message}`);

      if (check.issues && check.issues.length > 0) {
        console.log(`   Issues (${check.issues.length}):`);
        check.issues.forEach((issue, i) => {
          console.log(`     ${i + 1}. ${issue}`);
        });
      }
      console.log();
    });

    console.log('📊 SUMMARY:');
    console.log(`   Total Checks: ${reportInfo.report.summary.total_checks}`);
    console.log(`   Passed: ${reportInfo.report.summary.passed_checks}`);
    console.log(`   Failed: ${reportInfo.report.summary.failed_checks}`);
    console.log(`   Issues Found: ${reportInfo.report.summary.total_issues}`);
    console.log(`   Report File: ${reportInfo.reportFile}`);
    console.log('='.repeat(70));

    if (reportInfo.report.summary.failed_checks > 0) {
      console.log('🚨 ACTION REQUIRED: Run "npm run fix" to correct issues');
    } else {
      console.log('🎉 All checks passed! Data is consistent.');
    }
    console.log('='.repeat(70));
  }

  /**
   * Main verification function
   */
  async run() {
    console.log('🔍 Starting consistency verification...\n');

    // Load files
    const config = this.loadJsonFile(this.configFile);
    const data = this.loadJsonFile(this.dataFile);

    if (!config || !data) {
      console.error('❌ Failed to load required files');
      process.exit(1);
    }

    const results = [];

    // Run all checks
    console.log('1. Checking file structure...');
    const structureIssues = this.verifyStructure(config, data);
    results.push({
      name: 'file_structure',
      passed: structureIssues.length === 0,
      message: structureIssues.length === 0 ? 'File structure is valid' : 'File structure issues found',
      issues: structureIssues
    });

    console.log('2. Checking location count...');
    const countResult = this.verifyLocationCount(config, data);
    results.push({
      name: 'location_count',
      passed: countResult.passed,
      message: countResult.message,
      issues: countResult.passed ? [] : [countResult.message]
    });

    console.log('3. Checking individual locations...');
    const locationIssues = this.verifyIndividualLocations(config, data);
    results.push({
      name: 'individual_locations',
      passed: locationIssues.length === 0,
      message: locationIssues.length === 0 ? 'All locations are consistent' : 'Location inconsistencies found',
      issues: locationIssues
    });

    console.log('4. Checking total statistics...');
    const statsIssues = this.verifyTotalStatistics(config, data);
    results.push({
      name: 'total_statistics',
      passed: statsIssues.length === 0,
      message: statsIssues.length === 0 ? 'Statistics are consistent' : 'Statistics inconsistencies found',
      issues: statsIssues
    });

    console.log('5. Checking metadata...');
    const metadataIssues = this.verifyMetadata(data);
    results.push({
      name: 'metadata',
      passed: metadataIssues.length === 0,
      message: metadataIssues.length === 0 ? 'Metadata is valid' : 'Metadata issues found',
      issues: metadataIssues
    });

    // Generate report
    const reportInfo = this.generateReport(results);

    // Print results
    this.printResults(results, reportInfo);

    return {
      success: results.every(r => r.passed),
      results,
      report: reportInfo.report,
      reportFile: reportInfo.reportFile
    };
  }

  /**
   * Quick check mode
   */
  async quickCheck() {
    console.log('🚀 Running quick consistency check...');

    const config = this.loadJsonFile(this.configFile);
    const data = this.loadJsonFile(this.dataFile);

    if (!config || !data) {
      return { success: false, error: 'Failed to load files' };
    }

    // Just check the most critical items
    const criticalIssues = [];

    // Check location count
    if (config.locations?.length !== data.locations?.length) {
      criticalIssues.push(`Location count mismatch: ${config.locations?.length} vs ${data.locations?.length}`);
    }

    // Check total capacity
    const configTotal = config.total_capacity;
    const dataTotal = data.statistics;

    if (configTotal.bus !== dataTotal.total_bus_capacity) {
      criticalIssues.push(`Bus capacity mismatch`);
    }

    if (configTotal.mobil !== dataTotal.total_mobil_capacity) {
      criticalIssues.push(`Mobil capacity mismatch`);
    }

    if (configTotal.motor !== dataTotal.total_motor_capacity) {
      criticalIssues.push(`Motor capacity mismatch`);
    }

    const passed = criticalIssues.length === 0;

    if (passed) {
      console.log('✅ Quick check passed');
    } else {
      console.log('❌ Quick check failed:');
      criticalIssues.forEach(issue => console.log(`  - ${issue}`));
    }

    return {
      success: passed,
      issues: criticalIssues,
      passed
    };
  }
}

// Run if called directly
if (require.main === module) {
  const verifier = new ConsistencyVerifier();
  
  const args = process.argv.slice(2);
  if (args.includes('--quick')) {
    verifier.quickCheck();
  } else {
    verifier.run();
  }
}

module.exports = ConsistencyVerifier;
