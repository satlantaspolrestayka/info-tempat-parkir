#!/usr/bin/env node
/**
 * Test untuk workflow GitHub Actions
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class WorkflowTester {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.workflowDir = path.join(this.rootDir, '.github/workflows');
    this.results = [];
  }

  /**
   * Test 1: Validasi file workflow
   */
  testWorkflowFiles() {
    console.log('🔧 Testing workflow files...');
    
    const requiredWorkflows = [
      'validate-parking.yml',
      'update-data.yml',
      'consistency-check.yml',
      'daily-backup.yml',
      'realtime-monitor.yml',
      'emergency-fix.yml'
    ];
    
    requiredWorkflows.forEach(workflow => {
      const workflowPath = path.join(this.workflowDir, workflow);
      
      if (fs.existsSync(workflowPath)) {
        try {
          // Cek jika valid YAML (sederhana)
          const content = fs.readFileSync(workflowPath, 'utf8');
          
          // Cek beberapa field penting
          const hasName = content.includes('name:');
          const hasOn = content.includes('on:');
          const hasJobs = content.includes('jobs:');
          
          if (hasName && hasOn && hasJobs) {
            this.results.push({
              test: `Workflow: ${workflow}`,
              passed: true,
              message: 'Valid workflow file',
              details: {
                size: content.length,
                lines: content.split('\n').length
              }
            });
          } else {
            this.results.push({
              test: `Workflow: ${workflow}`,
              passed: false,
              message: 'Missing required YAML sections',
              details: {
                hasName,
                hasOn,
                hasJobs
              }
            });
          }
          
        } catch (error) {
          this.results.push({
            test: `Workflow: ${workflow}`,
            passed: false,
            message: `Error reading workflow: ${error.message}`
          });
        }
      } else {
        this.results.push({
          test: `Workflow: ${workflow}`,
          passed: false,
          message: 'Workflow file not found'
        });
      }
    });
  }

  /**
   * Test 2: Validasi syntax YAML
   */
  testYamlSyntax() {
    console.log('📝 Testing YAML syntax...');
    
    try {
      // Coba parse semua file YAML dengan yaml parser jika ada
      const yamlFiles = fs.readdirSync(this.workflowDir)
        .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
      
      yamlFiles.forEach(file => {
        const filePath = path.join(this.workflowDir, file);
        
        try {
          // Coba gunakan yaml package jika terinstall
          let yaml;
          try {
            yaml = require('yaml');
          } catch (e) {
            // Fallback ke validasi sederhana
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Cek bracket matching sederhana
            const lines = content.split('\n');
            let indentLevel = 0;
            let valid = true;
            
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const trimmed = line.trim();
              
              if (trimmed.endsWith(':')) {
                // Ini adalah key baru
              } else if (trimmed.startsWith('-')) {
                // Ini adalah item array
              } else if (trimmed === '') {
                // Baris kosong
              } else if (!trimmed.includes(':') && trimmed !== '') {
                // Mungkin ada masalah
                valid = false;
                break;
              }
            }
            
            this.results.push({
              test: `YAML Syntax: ${file}`,
              passed: valid,
              message: valid ? 'YAML appears valid' : 'Potential YAML syntax issue',
              details: {
                lines: lines.length,
                validated_with: 'simple_validator'
              }
            });
            
            return;
          }
          
          // Gunakan yaml parser
          const content = fs.readFileSync(filePath, 'utf8');
          const parsed = yaml.parse(content);
          
          this.results.push({
            test: `YAML Syntax: ${file}`,
            passed: true,
            message: 'YAML syntax is valid',
            details: {
              parsed_keys: Object.keys(parsed || {}).length,
              validated_with: 'yaml_parser'
            }
          });
          
        } catch (error) {
          this.results.push({
            test: `YAML Syntax: ${file}`,
            passed: false,
            message: `YAML syntax error: ${error.message}`,
            details: {
              error: error.message
            }
          });
        }
      });
      
    } catch (error) {
      this.results.push({
        test: 'YAML Syntax Check',
        passed: false,
        message: `Failed to check YAML syntax: ${error.message}`
      });
    }
  }

  /**
   * Test 3: Test script dependencies
   */
  testScriptDependencies() {
    console.log('📦 Testing script dependencies...');
    
    const workflowFiles = fs.readdirSync(this.workflowDir)
      .filter(file => file.endsWith('.yml'));
    
    const referencedScripts = new Set();
    
    workflowFiles.forEach(file => {
      const content = fs.readFileSync(path.join(this.workflowDir, file), 'utf8');
      
      // Cari referensi ke script
      const scriptMatches = content.match(/node scripts\/[a-zA-Z0-9\-]+\.js/g) || [];
      scriptMatches.forEach(match => {
        const scriptName = match.replace('node scripts/', '');
        referencedScripts.add(scriptName);
      });
    });
    
    // Cek apakah script yang direferensikan ada
    const scriptsDir = path.join(this.rootDir, 'scripts');
    const existingScripts = new Set(
      fs.readdirSync(scriptsDir).filter(file => file.endsWith('.js'))
    );
    
    referencedScripts.forEach(script => {
      if (existingScripts.has(script)) {
        this.results.push({
          test: `Script Reference: ${script}`,
          passed: true,
          message: `Script referenced in workflows exists`,
          details: {
            referenced_in: Array.from(workflowFiles).filter(file => {
              const content = fs.readFileSync(path.join(this.workflowDir, file), 'utf8');
              return content.includes(script);
            })
          }
        });
      } else {
        this.results.push({
          test: `Script Reference: ${script}`,
          passed: false,
          message: `Script referenced in workflows but not found`,
          details: {
            missing_script: script
          }
        });
      }
    });
  }

  /**
   * Test 4: Test cron schedule validity
   */
  testCronSchedules() {
    console.log('⏰ Testing cron schedules...');
    
    const workflowFiles = fs.readdirSync(this.workflowDir)
      .filter(file => file.endsWith('.yml'));
    
    workflowFiles.forEach(file => {
      const content = fs.readFileSync(path.join(this.workflowDir, file), 'utf8');
      
      // Cari cron schedules
      const cronMatches = content.match(/\s+cron:\s+['"]([^'"]+)['"]/g) || [];
      
      cronMatches.forEach(match => {
        const cronExpr = match.match(/['"]([^'"]+)['"]/)[1];
        
        // Validasi sederhana cron expression
        const cronParts = cronExpr.split(' ');
        const isValid = cronParts.length === 5;
        
        this.results.push({
          test: `Cron Schedule: ${file}`,
          passed: isValid,
          message: isValid ? `Valid cron expression: ${cronExpr}` : `Invalid cron expression: ${cronExpr}`,
          details: {
            expression: cronExpr,
            parts: cronParts.length
          }
        });
      });
    });
  }

  /**
   * Test 5: Test workflow permissions
   */
  testWorkflowPermissions() {
    console.log('🔐 Testing workflow permissions...');
    
    const workflowFiles = fs.readdirSync(this.workflowDir)
      .filter(file => file.endsWith('.yml'));
    
    workflowFiles.forEach(file => {
      const content = fs.readFileSync(path.join(this.workflowDir, file), 'utf8');
      
      // Cek apakah ada permissions section
      const hasPermissions = content.includes('permissions:');
      const hasWritePermission = content.includes('contents: write') || 
                                content.includes('contents: write');
      
      // Workflow yang membutuhkan write permissions
      const needsWrite = file.includes('update-data') || 
                        file.includes('emergency-fix') || 
                        file.includes('daily-backup');
      
      if (needsWrite && !hasWritePermission) {
        this.results.push({
          test: `Permissions: ${file}`,
          passed: false,
          message: 'Workflow needs write permissions but not configured',
          details: {
            needs_write: true,
            has_permissions: hasPermissions,
            has_write: hasWritePermission
          }
        });
      } else {
        this.results.push({
          test: `Permissions: ${file}`,
          passed: true,
          message: needsWrite ? 'Write permissions properly configured' : 'Permissions OK',
          details: {
            needs_write: needsWrite,
            has_permissions: hasPermissions,
            has_write: hasWritePermission
          }
        });
      }
    });
  }

  /**
   * Test 6: Test dengan dry-run scripts
   */
  testDryRunScripts() {
    console.log('🧪 Testing scripts with dry-run...');
    
    const scriptsToTest = [
      'validate-parking.js --dry-run',
      'monitor-statistics.js',
      'verify-consistency.js --quick',
      'health-check.js'
    ];
    
    scriptsToTest.forEach(scriptCmd => {
      try {
        console.log(`  Testing: ${scriptCmd}`);
        const output = execSync(`node scripts/${scriptCmd}`, { 
          cwd: this.rootDir,
          stdio: 'pipe',
          timeout: 30000 // 30 detik timeout
        }).toString();
        
        this.results.push({
          test: `Script Dry-run: ${scriptCmd.split(' ')[0]}`,
          passed: true,
          message: 'Script executed successfully',
          details: {
            execution_time: 'ok',
            output_length: output.length
          }
        });
        
      } catch (error) {
        this.results.push({
          test: `Script Dry-run: ${scriptCmd.split(' ')[0]}`,
          passed: false,
          message: `Script execution failed: ${error.message}`,
          details: {
            error: error.message,
            stderr: error.stderr?.toString(),
            stdout: error.stdout?.toString()
          }
        });
      }
    });
  }

  /**
   * Jalankan semua tests
   */
  async runAllTests() {
    console.log('🚀 Running Workflow Tests...\n');
    
    this.testWorkflowFiles();
    this.testYamlSyntax();
    this.testScriptDependencies();
    this.testCronSchedules();
    this.testWorkflowPermissions();
    await this.testDryRunScripts();
    
    this.printResults();
    this.saveResults();
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
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
    console.log('📊 WORKFLOW TEST RESULTS');
    console.log('='.repeat(70));
    
    this.results.forEach((result, index) => {
      const icon = result.passed ? '✅' : '❌';
      const status = result.passed ? 'PASS' : 'FAIL';
      
      console.log(`\n${index + 1}. ${icon} ${result.test} [${status}]`);
      console.log(`   ${result.message}`);
      
      if (result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            if (Array.isArray(value)) {
              console.log(`   ${key}: ${value.join(', ')}`);
            } else {
              console.log(`   ${key}: ${value}`);
            }
          }
        });
      }
    });
    
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    
    console.log('\n' + '='.repeat(70));
    console.log(`📈 SUMMARY: ${passed} passed, ${total - passed} failed, ${total} total`);
    
    if (passed === total) {
      console.log('🎉 All workflow tests passed! GitHub Actions should work correctly.');
    } else {
      console.log('⚠️ Some workflow tests failed. Check the issues above.');
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
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.passed).length,
        failed: this.results.filter(r => !r.passed).length
      },
      tests: this.results,
      environment: {
        node_version: process.version,
        platform: process.platform,
        workflow_dir: this.workflowDir
      }
    };
    
    const reportFile = path.join(reportDir, `workflow-tests-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
    
    console.log(`\n📁 Test report saved: ${reportFile}`);
    
    return reportFile;
  }

  /**
   * Main function
   */
  async run() {
    const results = await this.runAllTests();
    
    // Return exit code berdasarkan hasil
    return results.success ? 0 : 1;
  }
}

// Run if called directly
if (require.main === module) {
  const tester = new WorkflowTester();
  tester.run().then(exitCode => {
    process.exit(exitCode);
  }).catch(error => {
    console.error('❌ Workflow tester failed:', error);
    process.exit(1);
  });
}

module.exports = WorkflowTester;
