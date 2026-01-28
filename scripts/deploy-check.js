#!/usr/bin/env node
/**
 * Script untuk memeriksa kesiapan deployment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class DeploymentChecker {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.results = {
      timestamp: new Date().toISOString(),
      environment: 'unknown',
      checks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        warnings: 0
      },
      ready_for_deployment: false
    };
  }

  /**
   * Tambahkan hasil check
   */
  addCheck(name, status, message, details = {}) {
    this.results.checks.push({
      name,
      status, // 'passed', 'failed', 'warning'
      message,
      details
    });
    
    this.results.summary.total++;
    
    if (status === 'passed') {
      this.results.summary.passed++;
    } else if (status === 'failed') {
      this.results.summary.failed++;
    } else if (status === 'warning') {
      this.results.summary.warnings++;
    }
  }

  /**
   * Check: Environment detection
   */
  checkEnvironment() {
    try {
      // Cek apakah di GitHub Actions
      const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';
      const isLocal = !isGitHubActions;
      
      this.results.environment = isGitHubActions ? 'github_actions' : 'local';
      
      this.addCheck(
        'environment',
        'passed',
        `Running in ${isGitHubActions ? 'GitHub Actions' : 'local'} environment`,
        { is_github_actions: isGitHubActions }
      );
      
      return true;
    } catch (error) {
      this.addCheck('environment', 'failed', `Environment check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Check: File requirements
   */
  checkRequiredFiles() {
    const requiredFiles = [
      'index.html',
      'admin-petugas.html',
      'data/parkir-data.json',
      'config/locations-config.json',
      'config/system-settings.json',
      'Package.json'
    ];
    
    const optionalFiles = [
      'config/notifications.json',
      'config/vehicle-types.json',
      'data/pending-updates.json',
      'README.md',
      'manifest.json',
      'sw.js'
    ];
    
    let allRequiredExist = true;
    
    // Check required files
    requiredFiles.forEach(file => {
      const filePath = path.join(this.rootDir, file);
      const exists = fs.existsSync(filePath);
      
      if (!exists) {
        this.addCheck(
          `required_file_${file}`,
          'failed',
          `Required file missing: ${file}`,
          { file, exists: false }
        );
        allRequiredExist = false;
      } else {
        this.addCheck(
          `required_file_${file}`,
          'passed',
          `Required file exists: ${file}`,
          { file, exists: true }
        );
      }
    });
    
    // Check optional files
    optionalFiles.forEach(file => {
      const filePath = path.join(this.rootDir, file);
      const exists = fs.existsSync(filePath);
      
      if (!exists) {
        this.addCheck(
          `optional_file_${file}`,
          'warning',
          `Optional file missing: ${file}`,
          { file, exists: false, optional: true }
        );
      } else {
        this.addCheck(
          `optional_file_${file}`,
          'passed',
          `Optional file exists: ${file}`,
          { file, exists: true, optional: true }
        );
      }
    });
    
    return allRequiredExist;
  }

  /**
   * Check: Directory structure
   */
  checkDirectoryStructure() {
    const requiredDirs = [
      'config/',
      'data/',
      'data/backups/',
      'data/logs/',
      'data/reports/',
      'scripts/',
      '.github/workflows/'
    ];
    
    let allDirsExist = true;
    
    requiredDirs.forEach(dir => {
      const dirPath = path.join(this.rootDir, dir);
      const exists = fs.existsSync(dirPath);
      
      if (!exists) {
        this.addCheck(
          `directory_${dir.replace(/\//g, '_')}`,
          'failed',
          `Required directory missing: ${dir}`,
          { directory: dir, exists: false }
        );
        allDirsExist = false;
      } else {
        // Check if it's actually a directory
        const isDir = fs.statSync(dirPath).isDirectory();
        this.addCheck(
          `directory_${dir.replace(/\//g, '_')}`,
          isDir ? 'passed' : 'failed',
          isDir ? `Directory exists: ${dir}` : `Path exists but is not a directory: ${dir}`,
          { directory: dir, exists: true, is_directory: isDir }
        );
        
        if (!isDir) {
          allDirsExist = false;
        }
      }
    });
    
    return allDirsExist;
  }

  /**
   * Check: File permissions
   */
  checkFilePermissions() {
    const filesToCheck = [
      'scripts/*.js',
      'Package.json',
      'setup-validator.sh'
    ];
    
    let allPermissionsOk = true;
    
    filesToCheck.forEach(pattern => {
      const files = this.glob(pattern);
      
      files.forEach(file => {
        try {
          fs.accessSync(file, fs.constants.R_OK);
          this.addCheck(
            `permission_${path.basename(file)}`,
            'passed',
            `File is readable: ${path.relative(this.rootDir, file)}`,
            { file: path.relative(this.rootDir, file), readable: true }
          );
        } catch (error) {
          this.addCheck(
            `permission_${path.basename(file)}`,
            'failed',
            `File is not readable: ${path.relative(this.rootDir, file)}`,
            { file: path.relative(this.rootDir, file), readable: false, error: error.message }
          );
          allPermissionsOk = false;
        }
      });
    });
    
    // Check execute permissions for scripts
    const scripts = this.glob('scripts/*.js');
    scripts.forEach(script => {
      try {
        fs.accessSync(script, fs.constants.X_OK);
        this.addCheck(
          `executable_${path.basename(script)}`,
          'passed',
          `Script is executable: ${path.relative(this.rootDir, script)}`,
          { script: path.relative(this.rootDir, script), executable: true }
        );
      } catch (error) {
        this.addCheck(
          `executable_${path.basename(script)}`,
          'warning',
          `Script is not executable: ${path.relative(this.rootDir, script)}`,
          { script: path.relative(this.rootDir, script), executable: false, error: error.message }
        );
      }
    });
    
    return allPermissionsOk;
  }

  /**
   * Helper: Simple glob function
   */
  glob(pattern) {
    const baseDir = pattern.startsWith('scripts/') ? 'scripts' : '.';
    const searchPattern = pattern.includes('*') ? pattern.split('/').pop() : pattern;
    
    const files = [];
    
    if (pattern === 'scripts/*.js') {
      const scriptsDir = path.join(this.rootDir, 'scripts');
      if (fs.existsSync(scriptsDir)) {
        fs.readdirSync(scriptsDir)
          .filter(file => file.endsWith('.js'))
          .forEach(file => {
            files.push(path.join(scriptsDir, file));
          });
      }
    }
    
    return files;
  }

  /**
   * Check: JSON validity
   */
  checkJsonValidity() {
    const jsonFiles = this.glob('config/*.json')
      .concat(this.glob('data/*.json'))
      .filter(file => !file.includes('backups') && !file.includes('logs'));
    
    let allJsonValid = true;
    
    jsonFiles.forEach(file => {
      try {
        const content = fs.readFileSync(file, 'utf8');
        JSON.parse(content);
        
        this.addCheck(
          `json_validity_${path.basename(file)}`,
          'passed',
          `Valid JSON: ${path.relative(this.rootDir, file)}`,
          { file: path.relative(this.rootDir, file), valid: true }
        );
      } catch (error) {
        this.addCheck(
          `json_validity_${path.basename(file)}`,
          'failed',
          `Invalid JSON in ${path.relative(this.rootDir, file)}: ${error.message}`,
          { file: path.relative(this.rootDir, file), valid: false, error: error.message }
        );
        allJsonValid = false;
      }
    });
    
    return allJsonValid;
  }

  /**
   * Check: Data consistency
   */
  checkDataConsistency() {
    try {
      const dataPath = path.join(this.rootDir, 'data/parkir-data.json');
      const configPath = path.join(this.rootDir, 'config/locations-config.json');
      
      if (!fs.existsSync(dataPath) || !fs.existsSync(configPath)) {
        this.addCheck('data_consistency', 'failed', 'Required files for consistency check missing');
        return false;
      }
      
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      const issues = [];
      
      // Check location count
      if (data.locations.length !== config.locations.length) {
        issues.push(`Location count mismatch: data=${data.locations.length}, config=${config.locations.length}`);
      }
      
      // Check statistics
      let calculatedBus = 0;
      let calculatedMobil = 0;
      let calculatedMotor = 0;
      
      data.locations.forEach(location => {
        calculatedBus += location.bus?.available || 0;
        calculatedMobil += location.mobil?.available || 0;
        calculatedMotor += location.motor?.available || 0;
      });
      
      if (calculatedBus !== data.statistics.total_available_bus) {
        issues.push(`Bus statistics mismatch: calculated=${calculatedBus}, reported=${data.statistics.total_available_bus}`);
      }
      
      if (calculatedMobil !== data.statistics.total_available_mobil) {
        issues.push(`Mobil statistics mismatch: calculated=${calculatedMobil}, reported=${data.statistics.total_available_mobil}`);
      }
      
      if (calculatedMotor !== data.statistics.total_available_motor) {
        issues.push(`Motor statistics mismatch: calculated=${calculatedMotor}, reported=${data.statistics.total_available_motor}`);
      }
      
      if (issues.length === 0) {
        this.addCheck(
          'data_consistency',
          'passed',
          'Data is consistent with configuration',
          {
            locations_count: data.locations.length,
            statistics_consistent: true
          }
        );
        return true;
      } else {
        this.addCheck(
          'data_consistency',
          'failed',
          `Data consistency issues found: ${issues.length}`,
          {
            issues,
            locations_count: data.locations.length,
            statistics_consistent: false
          }
        );
        return false;
      }
      
    } catch (error) {
      this.addCheck(
        'data_consistency',
        'failed',
        `Data consistency check failed: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Check: Git status
   */
  checkGitStatus() {
    try {
      // Check if we're in a git repository
      execSync('git rev-parse --is-inside-work-tree', { stdio: 'pipe' });
      
      // Get current branch
      const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
      
      // Check for uncommitted changes
      const statusOutput = execSync('git status --porcelain', { encoding: 'utf8' });
      const hasUncommittedChanges = statusOutput.trim().length > 0;
      
      // Get latest commit
      const latestCommit = execSync('git log -1 --oneline', { encoding: 'utf8' }).trim();
      
      this.addCheck(
        'git_status',
        hasUncommittedChanges ? 'warning' : 'passed',
        hasUncommittedChanges ? 'There are uncommitted changes' : 'Git repository is clean',
        {
          branch,
          has_uncommitted_changes: hasUncommittedChanges,
          latest_commit: latestCommit,
          uncommitted_files: hasUncommittedChanges ? statusOutput.split('\n').filter(l => l).length : 0
        }
      );
      
      return !hasUncommittedChanges;
      
    } catch (error) {
      this.addCheck(
        'git_status',
        'warning',
        `Git check failed: ${error.message}`,
        { error: error.message }
      );
      return false;
    }
  }

  /**
   * Check: Dependencies
   */
  checkDependencies() {
    try {
      // Check if package.json exists
      const packagePath = path.join(this.rootDir, 'Package.json');
      if (!fs.existsSync(packagePath)) {
        this.addCheck('dependencies', 'failed', 'Package.json not found');
        return false;
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      
      // Check required scripts
      const requiredScripts = ['validate', 'test', 'monitor'];
      const missingScripts = requiredScripts.filter(script => !packageJson.scripts?.[script]);
      
      if (missingScripts.length > 0) {
        this.addCheck(
          'dependencies',
          'warning',
          `Missing recommended npm scripts: ${missingScripts.join(', ')}`,
          { missing_scripts: missingScripts }
        );
      } else {
        this.addCheck(
          'dependencies',
          'passed',
          'All required npm scripts available',
          { scripts: Object.keys(packageJson.scripts || {}) }
        );
      }
      
      // Check node version
      const requiredNodeVersion = packageJson.engines?.node || '>=18.0.0';
      const currentNodeVersion = process.version;
      
      this.addCheck(
        'node_version',
        'passed',
        `Node.js version: ${currentNodeVersion}`,
        { current: currentNodeVersion, required: requiredNodeVersion }
      );
      
      return true;
      
    } catch (error) {
      this.addCheck(
        'dependencies',
        'failed',
        `Dependencies check failed: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Check: GitHub Pages readiness
   */
  checkGitHubPages() {
    try {
      // Check for required files for GitHub Pages
      const requiredForPages = ['index.html'];
      const missingForPages = [];
      
      requiredForPages.forEach(file => {
        if (!fs.existsSync(path.join(this.rootDir, file))) {
          missingForPages.push(file);
        }
      });
      
      if (missingForPages.length > 0) {
        this.addCheck(
          'github_pages',
          'failed',
          `Missing files for GitHub Pages: ${missingForPages.join(', ')}`,
          { missing_files: missingForPages }
        );
        return false;
      }
      
      // Check for CNAME file (custom domain)
      const hasCNAME = fs.existsSync(path.join(this.rootDir, 'CNAME'));
      
      this.addCheck(
        'github_pages',
        'passed',
        `Ready for GitHub Pages ${hasCNAME ? '(with custom domain)' : ''}`,
        { has_cname: hasCNAME }
      );
      
      return true;
      
    } catch (error) {
      this.addCheck(
        'github_pages',
        'failed',
        `GitHub Pages check failed: ${error.message}`
      );
      return false;
    }
  }

  /**
   * Jalankan semua checks
   */
  async runAllChecks() {
    console.log('🔍 Running deployment checks...\n');
    
    // Run all checks
    this.checkEnvironment();
    this.checkRequiredFiles();
    this.checkDirectoryStructure();
    this.checkFilePermissions();
    this.checkJsonValidity();
    this.checkDataConsistency();
    this.checkGitStatus();
    this.checkDependencies();
    this.checkGitHubPages();
    
    // Determine if ready for deployment
    const hasCriticalFailures = this.results.checks.some(
      check => check.status === 'failed' && 
      !check.name.includes('optional_file') && 
      !check.name.includes('executable')
    );
    
    this.results.ready_for_deployment = !hasCriticalFailures;
    
    return this.results;
  }

  /**
   * Generate report
   */
  generateReport() {
    const reportDir = path.join(this.rootDir, 'data/reports');
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }
    
    const reportFile = path.join(reportDir, `deployment-check-${new Date().toISOString().split('T')[0]}.json`);
    fs.writeFileSync(reportFile, JSON.stringify(this.results, null, 2));
    
    return reportFile;
  }

  /**
   * Print results
   */
  printResults() {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 DEPLOYMENT CHECK RESULTS');
    console.log('='.repeat(70));
    
    console.log(`\nEnvironment: ${this.results.environment}`);
    console.log(`Timestamp: ${new Date(this.results.timestamp).toLocaleString()}`);
    
    console.log('\n' + '-'.repeat(70));
    console.log('CHECKS SUMMARY:');
    console.log('-'.repeat(70));
    console.log(`✅ Passed: ${this.results.summary.passed}`);
    console.log(`⚠️  Warnings: ${this.results.summary.warnings}`);
    console.log(`❌ Failed: ${this.results.summary.failed}`);
    console.log(`📊 Total: ${this.results.summary.total}`);
    
    console.log('\n' + '-'.repeat(70));
    console.log('DETAILED RESULTS:');
    console.log('-'.repeat(70));
    
    this.results.checks.forEach((check, index) => {
      const icon = check.status === 'passed' ? '✅' : 
                   check.status === 'failed' ? '❌' : '⚠️';
      
      console.log(`\n${index + 1}. ${icon} ${check.name}`);
      console.log(`   ${check.message}`);
      
      if (check.details && Object.keys(check.details).length > 0) {
        Object.entries(check.details).forEach(([key, value]) => {
          if (key !== 'error' && value !== undefined && value !== null) {
            console.log(`   ${key}: ${value}`);
          }
        });
      }
      
      if (check.details?.error) {
        console.log(`   Error: ${check.details.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(70));
    console.log(`DEPLOYMENT READY: ${this.results.ready_for_deployment ? '✅ YES' : '❌ NO'}`);
    
    if (!this.results.ready_for_deployment) {
      console.log('\n🚨 Issues to fix before deployment:');
      this.results.checks
        .filter(check => check.status === 'failed')
        .forEach(check => {
          console.log(`   • ${check.name}: ${check.message}`);
        });
    }
    
    console.log('='.repeat(70));
  }

  /**
   * Main function
   */
  async run() {
    await this.runAllChecks();
    const reportFile = this.generateReport();
    this.printResults();
    
    console.log(`\n📁 Report saved to: ${reportFile}`);
    
    return {
      ready: this.results.ready_for_deployment,
      results: this.results,
      reportFile
    };
  }
}

// Run if called directly
if (require.main === module) {
  const checker = new DeploymentChecker();
  checker.run().catch(console.error);
}

module.exports = DeploymentChecker;
