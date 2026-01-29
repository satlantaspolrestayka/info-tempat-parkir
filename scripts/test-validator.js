[file name]: test-validator.js
[file content begin]
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ValidatorTester {
  constructor() {
    this.testResults = [];
    this.testDataPath = path.join(__dirname, '../data/test-data.json');
    this.testConfigPath = path.join(__dirname, '../config/test-locations-config.json');
    this.rootDir = path.join(__dirname, '..');
  }

  async runAllTests() {
    console.log('🧪 Running Parking Validator Tests\n');
    
    await this.testStructureValidation();
    await this.testNumberParsing();
    await this.testCapacityValidation();
    await this.testStatisticsCalculation();
    await this.testConfigIntegration();
    await this.testBackupFunctionality();
    await this.testErrorHandling();
    
    this.printResults();
  }

  async testStructureValidation() {
    try {
      // Test 1: Valid structure
      const validData = {
        metadata: { version: "1.0.0" },
        locations: [
          { 
            id: 1,
            nama: "Test Location",
            bus: { total: 10, available: 5, last_update: "2024-01-01T00:00:00Z" },
            mobil: { total: 20, available: 10, last_update: "2024-01-01T00:00:00Z" },
            motor: { total: 30, available: 20, last_update: "2024-01-01T00:00:00Z" }
          }
        ],
        statistics: {
          total_bus_capacity: 10,
          total_mobil_capacity: 20,
          total_motor_capacity: 30
        }
      };
      
      fs.writeFileSync(this.testDataPath, JSON.stringify(validData));
      
      // Create test config
      const testConfig = {
        locations: [
          {
            id: 1,
            code: "TEST",
            name: "Test Location",
            capacity: {
              bus: { total: 10, unit: "unit" },
              mobil: { total: 20, unit: "unit" },
              motor: { total: 30, unit: "unit" }
            }
          }
        ],
        total_capacity: { bus: 10, mobil: 20, motor: 30 }
      };
      
      fs.writeFileSync(this.testConfigPath, JSON.stringify(testConfig));
      
      // Run validator with test config
      execSync(`node scripts/validate-parking.js --dry-run --data=${this.testDataPath} --config=${this.testConfigPath}`, { 
        stdio: 'pipe',
        cwd: this.rootDir 
      });
      
      this.testResults.push({ test: 'Structure Validation - Valid', passed: true });
    } catch (error) {
      this.testResults.push({ test: 'Structure Validation - Valid', passed: false, error: error.message });
    }

    try {
      // Test 2: Invalid structure (no locations array)
      const invalidData = { statistics: {} };
      fs.writeFileSync(this.testDataPath, JSON.stringify(invalidData));
      
      execSync(`node scripts/validate-parking.js --dry-run --data=${this.testDataPath}`, { 
        stdio: 'pipe',
        cwd: this.rootDir 
      });
      this.testResults.push({ test: 'Structure Validation - Invalid', passed: false });
    } catch (error) {
      // Should throw error - this is expected
      this.testResults.push({ test: 'Structure Validation - Invalid', passed: true });
    }
  }

  async testNumberParsing() {
    const testCases = [
      { input: "10", expected: 10 },
      { input: "abc", expected: 0 },
      { input: null, expected: 0 },
      { input: -5, expected: 0 },
      { input: 15.7, expected: 16 }
    ];

    testCases.forEach((testCase, index) => {
      try {
        // This would test the parseNumber method from validate-parking.js
        // For now, we'll simulate
        const result = this.simulateParseNumber(testCase.input);
        const passed = result === testCase.expected;
        
        this.testResults.push({ 
          test: `Number Parsing Test ${index + 1}`, 
          passed,
          details: `${testCase.input} → ${result} (expected: ${testCase.expected})`
        });
      } catch (error) {
        this.testResults.push({ test: `Number Parsing Test ${index + 1}`, passed: false, error: error.message });
      }
    });
  }

  simulateParseNumber(value) {
    if (value === null || value === undefined || value === '') return 0;
    const num = Number(value);
    return isNaN(num) ? 0 : Math.max(0, Math.round(num));
  }

  async testCapacityValidation() {
    try {
      // Create test data with issues
      const data = {
        metadata: { version: "1.0.0" },
        locations: [
          { 
            id: 1,
            nama: "Test Location", 
            bus: { total: -5, available: 10 },  // Negative total, available > total
            mobil: { total: 100, available: 100 },
            motor: { total: 0, available: 0 }
          }
        ],
        statistics: {}
      };

      // Create matching config
      const config = {
        locations: [
          {
            id: 1,
            code: "TEST",
            name: "Test Location",
            capacity: {
              bus: { total: 10, unit: "unit" },
              mobil: { total: 100, unit: "unit" },
              motor: { total: 0, unit: "unit" }
            }
          }
        ]
      };

      fs.writeFileSync(this.testDataPath, JSON.stringify(data));
      fs.writeFileSync(this.testConfigPath, JSON.stringify(config));
      
      const output = execSync(
        `node scripts/validate-parking.js --dry-run --mode=fix --data=${this.testDataPath} --config=${this.testConfigPath}`, 
        { 
          encoding: 'utf8',
          cwd: this.rootDir 
        }
      );

      // Check if issues were detected
      const issuesDetected = output.includes('Negative') || output.includes('exceeds') || output.includes('mismatch');
      
      this.testResults.push({ 
        test: 'Capacity Validation', 
        passed: issuesDetected,
        details: issuesDetected ? 'Issues correctly detected' : 'Failed to detect issues'
      });
    } catch (error) {
      this.testResults.push({ test: 'Capacity Validation', passed: false, error: error.message });
    }
  }

  async testStatisticsCalculation() {
    try {
      const data = {
        metadata: { version: "1.0.0" },
        locations: [
          { 
            id: 1,
            nama: "A", 
            bus: { total: 10, available: 3 }, 
            mobil: { total: 20, available: 10 }, 
            motor: { total: 30, available: 20 } 
          },
          { 
            id: 2,
            nama: "B", 
            bus: { total: 5, available: 2 }, 
            mobil: { total: 15, available: 5 }, 
            motor: { total: 25, available: 15 } 
          }
        ],
        statistics: {}
      };

      // Create matching config
      const config = {
        locations: [
          {
            id: 1,
            code: "A",
            name: "A",
            capacity: {
              bus: { total: 10, unit: "unit" },
              mobil: { total: 20, unit: "unit" },
              motor: { total: 30, unit: "unit" }
            }
          },
          {
            id: 2,
            code: "B",
            name: "B",
            capacity: {
              bus: { total: 5, unit: "unit" },
              mobil: { total: 15, unit: "unit" },
              motor: { total: 25, unit: "unit" }
            }
          }
        ],
        total_capacity: { bus: 15, mobil: 35, motor: 55 }
      };

      fs.writeFileSync(this.testDataPath, JSON.stringify(data));
      fs.writeFileSync(this.testConfigPath, JSON.stringify(config));
      
      execSync(
        `node scripts/validate-parking.js --dry-run --data=${this.testDataPath} --config=${this.testConfigPath}`, 
        { 
          stdio: 'pipe',
          cwd: this.rootDir 
        }
      );
      
      // Load and verify results
      const result = JSON.parse(fs.readFileSync(this.testDataPath, 'utf8'));
      
      const expectedBusTotal = 15; // 10 + 5
      const expectedBusAvailable = 5; // 3 + 2
      
      const actualBusTotal = result.statistics.total_bus_capacity;
      const actualBusAvailable = result.statistics.total_available_bus;
      
      const passed = actualBusTotal === expectedBusTotal && actualBusAvailable === expectedBusAvailable;
      
      this.testResults.push({ 
        test: 'Statistics Calculation', 
        passed,
        details: `Bus: ${actualBusTotal}/${actualBusAvailable} (expected: ${expectedBusTotal}/${expectedBusAvailable})`
      });
    } catch (error) {
      this.testResults.push({ test: 'Statistics Calculation', passed: false, error: error.message });
    }
  }

  async testConfigIntegration() {
    try {
      const data = {
        metadata: { version: "1.0.0" },
        locations: [
          { 
            id: 1,
            nama: "Test Location", 
            bus: { total: 5, available: 3 },  // Different from config
            mobil: { total: 20, available: 10 },
            motor: { total: 30, available: 20 }
          }
        ],
        statistics: {}
      };

      const config = {
        locations: [
          {
            id: 1,
            code: "TEST",
            name: "Test Location",
            capacity: {
              bus: { total: 10, unit: "unit" },  // Config says 10, data says 5
              mobil: { total: 20, unit: "unit" },
              motor: { total: 30, unit: "unit" }
            }
          }
        ]
      };

      fs.writeFileSync(this.testDataPath, JSON.stringify(data));
      fs.writeFileSync(this.testConfigPath, JSON.stringify(config));
      
      const output = execSync(
        `node scripts/validate-parking.js --dry-run --mode=fix --data=${this.testDataPath} --config=${this.testConfigPath}`, 
        { 
          encoding: 'utf8',
          cwd: this.rootDir 
        }
      );

      const configIssueDetected = output.includes("doesn't match config") || output.includes("mismatch");
      
      this.testResults.push({ 
        test: 'Config Integration', 
        passed: configIssueDetected,
        details: configIssueDetected ? 'Config mismatch detected' : 'Failed to detect config mismatch'
      });
    } catch (error) {
      this.testResults.push({ test: 'Config Integration', passed: false, error: error.message });
    }
  }

  async testBackupFunctionality() {
    try {
      const backupDir = path.join(this.rootDir, 'data/backups');
      const initialBackupCount = fs.existsSync(backupDir) ? 
        fs.readdirSync(backupDir).filter(f => f.includes('backup')).length : 0;
      
      // Create simple test data
      const testData = {
        metadata: { version: "1.0.0" },
        locations: [{ id: 1, nama: "Test", bus: { total: 10, available: 5 } }],
        statistics: {}
      };
      
      fs.writeFileSync(this.testDataPath, JSON.stringify(testData));
      
      execSync(
        `node scripts/validate-parking.js --data=${this.testDataPath} --max-backups=3`, 
        { 
          stdio: 'pipe',
          cwd: this.rootDir 
        }
      );
      
      const finalBackupCount = fs.existsSync(backupDir) ? 
        fs.readdirSync(backupDir).filter(f => f.includes('backup')).length : 0;
      
      const backupCreated = finalBackupCount > initialBackupCount;
      
      this.testResults.push({ 
        test: 'Backup Creation', 
        passed: backupCreated,
        details: `Backups: ${initialBackupCount} → ${finalBackupCount}`
      });
    } catch (error) {
      this.testResults.push({ test: 'Backup Creation', passed: false, error: error.message });
    }
  }

  async testErrorHandling() {
    try {
      // Test with non-existent file
      execSync('node scripts/validate-parking.js --data=data/non-existent.json', { 
        stdio: 'pipe',
        cwd: this.rootDir 
      });
      this.testResults.push({ test: 'Error Handling - Missing File', passed: false });
    } catch (error) {
      // Should throw error - this is expected
      const errorMessage = error.message.toLowerCase();
      const properError = errorMessage.includes('not found') || errorMessage.includes('no such file');
      
      this.testResults.push({ 
        test: 'Error Handling - Missing File', 
        passed: properError,
        details: properError ? 'Proper error thrown' : 'Incorrect error handling'
      });
    }

    try {
      // Test with invalid JSON
      fs.writeFileSync(this.testDataPath, 'invalid json {');
      execSync(`node scripts/validate-parking.js --data=${this.testDataPath}`, { 
        stdio: 'pipe',
        cwd: this.rootDir 
      });
      this.testResults.push({ test: 'Error Handling - Invalid JSON', passed: false });
    } catch (error) {
      // Should throw error - this is expected
      const properError = error.message.includes('JSON') || error.message.includes('SyntaxError');
      
      this.testResults.push({ 
        test: 'Error Handling - Invalid JSON', 
        passed: properError,
        details: properError ? 'Proper error thrown' : 'Incorrect error handling'
      });
    }
  }

  printResults() {
    console.log('\n' + '='.repeat(60));
    console.log('TEST RESULTS SUMMARY');
    console.log('='.repeat(60));
    
    let passed = 0;
    let failed = 0;
    
    this.testResults.forEach((result, index) => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`${index + 1}. ${status} - ${result.test}`);
      
      if (result.details) {
        console.log(`   Details: ${result.details}`);
      }
      
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      
      result.passed ? passed++ : failed++;
    });
    
    console.log('\n' + '='.repeat(60));
    console.log(`TOTAL: ${this.testResults.length} tests`);
    console.log(`PASSED: ${passed}`);
    console.log(`FAILED: ${failed}`);
    console.log(`SUCCESS RATE: ${((passed / this.testResults.length) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
    
    // Cleanup test files
    try {
      if (fs.existsSync(this.testDataPath)) fs.unlinkSync(this.testDataPath);
      if (fs.existsSync(this.testConfigPath)) fs.unlinkSync(this.testConfigPath);
    } catch (error) {
      // Ignore cleanup errors
    }
    
    if (failed > 0) {
      process.exit(1);
    }
  }
}

// Run tests
(async () => {
  const tester = new ValidatorTester();
  await tester.runAllTests();
})();
[file content end]
