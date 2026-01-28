#!/usr/bin/env node
/**
 * Script untuk mengelola backup data parkir otomatis
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const zlib = require('zlib');
const { promisify } = require('util');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

class BackupManager {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.dataFile = path.join(this.rootDir, 'data/parkir-data.json');
    this.backupDir = path.join(this.rootDir, 'data/backups');
    this.configFile = path.join(this.rootDir, 'config/system-settings.json');
    
    // Load config
    this.config = this.loadConfig();
    
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  loadConfig() {
    try {
      return JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
    } catch (error) {
      console.warn('⚠️ System config not found, using defaults');
      return {
        data_management: {
          backup_interval: 3600000, // 1 jam
          max_backup_files: 30,
          data_retention_days: 90
        }
      };
    }
  }

  /**
   * Buat backup baru
   */
  async createBackup(type = 'manual', reason = 'scheduled') {
    const timestamp = new Date();
    const dateStr = timestamp.toISOString().split('T')[0];
    const timeStr = timestamp.toISOString().replace(/[:.]/g, '-');
    
    const backupInfo = {
      timestamp: timestamp.toISOString(),
      type,
      reason,
      original_file: this.dataFile,
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch
      }
    };

    try {
      // Baca data asli
      const data = fs.readFileSync(this.dataFile, 'utf8');
      backupInfo.original_size = Buffer.byteLength(data, 'utf8');
      
      // Tambahkan metadata ke data backup
      const backupData = {
        metadata: {
          backup_timestamp: timestamp.toISOString(),
          backup_type: type,
          backup_reason: reason,
          original_metadata: JSON.parse(data).metadata
        },
        data: JSON.parse(data)
      };

      // Simpan backup mentah
      const rawBackupFile = path.join(this.backupDir, `backup-raw-${timeStr}.json`);
      fs.writeFileSync(rawBackupFile, JSON.stringify(backupData, null, 2));
      backupInfo.raw_backup_file = rawBackupFile;
      backupInfo.raw_size = fs.statSync(rawBackupFile).size;

      // Buat versi terkompresi
      const compressedBackupFile = path.join(this.backupDir, `backup-compressed-${timeStr}.json.gz`);
      const compressed = await gzip(JSON.stringify(backupData));
      fs.writeFileSync(compressedBackupFile, compressed);
      backupInfo.compressed_backup_file = compressedBackupFile;
      backupInfo.compressed_size = fs.statSync(compressedBackupFile).size;
      backupInfo.compression_ratio = ((backupInfo.raw_size - backupInfo.compressed_size) / backupInfo.raw_size * 100).toFixed(1);

      // Simpan info backup
      const infoFile = path.join(this.backupDir, `backup-info-${timeStr}.json`);
      fs.writeFileSync(infoFile, JSON.stringify(backupInfo, null, 2));

      // Update latest backup reference
      const latestFile = path.join(this.backupDir, 'latest-backup.json');
      fs.writeFileSync(latestFile, JSON.stringify({
        timestamp: timestamp.toISOString(),
        backup_file: compressedBackupFile,
        info_file: infoFile,
        type,
        reason
      }, null, 2));

      console.log(`✅ Backup created: ${type} (${reason})`);
      console.log(`   Raw: ${backupInfo.raw_size} bytes`);
      console.log(`   Compressed: ${backupInfo.compressed_size} bytes (${backupInfo.compression_ratio}% smaller)`);
      console.log(`   Files: ${compressedBackupFile}`);

      // Cleanup old backups
      this.cleanupOldBackups();

      return {
        success: true,
        backupInfo,
        files: {
          raw: rawBackupFile,
          compressed: compressedBackupFile,
          info: infoFile,
          latest: latestFile
        }
      };

    } catch (error) {
      console.error('❌ Backup creation failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Hapus backup lama
   */
  cleanupOldBackups() {
    const maxFiles = this.config.data_management?.max_backup_files || 30;
    
    try {
      // Get all backup files
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('backup-') && (file.endsWith('.json') || file.endsWith('.json.gz')))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file),
          time: fs.statSync(path.join(this.backupDir, file)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // Delete old backups (keep only maxFiles)
      if (files.length > maxFiles) {
        const toDelete = files.slice(maxFiles);
        toDelete.forEach(file => {
          fs.unlinkSync(file.path);
          console.log(`🗑️  Deleted old backup: ${file.name}`);
        });
        
        return {
          deleted: toDelete.length,
          kept: maxFiles,
          total_before: files.length
        };
      }
      
      return {
        deleted: 0,
        kept: files.length,
        total_before: files.length
      };

    } catch (error) {
      console.warn('⚠️ Cleanup failed:', error.message);
      return {
        deleted: 0,
        error: error.message
      };
    }
  }

  /**
   * Restore dari backup
   */
  async restoreBackup(backupFile) {
    console.log(`🔄 Restoring from backup: ${backupFile}`);
    
    try {
      let backupData;
      
      // Handle compressed backups
      if (backupFile.endsWith('.gz')) {
        const compressed = fs.readFileSync(backupFile);
        const decompressed = await gunzip(compressed);
        backupData = JSON.parse(decompressed.toString());
      } else {
        // Handle raw backups
        backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
      }

      // Backup current data before restore
      const currentBackup = await this.createBackup('auto', 'pre-restore-backup');
      
      // Restore data
      const dataToRestore = backupData.data || backupData;
      fs.writeFileSync(this.dataFile, JSON.stringify(dataToRestore, null, 2));
      
      // Update metadata
      const restoredData = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      restoredData.metadata = {
        ...restoredData.metadata,
        restored_from: backupFile,
        restored_at: new Date().toISOString(),
        pre_restore_backup: currentBackup.files?.compressed
      };
      
      fs.writeFileSync(this.dataFile, JSON.stringify(restoredData, null, 2));

      console.log('✅ Restore completed successfully');
      console.log(`   Original backup: ${backupFile}`);
      console.log(`   Pre-restore backup: ${currentBackup.files?.compressed}`);
      
      return {
        success: true,
        backup_used: backupFile,
        pre_restore_backup: currentBackup.files?.compressed,
        data_restored: restoredData.metadata.last_updated
      };

    } catch (error) {
      console.error('❌ Restore failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Restore dari backup terakhir
   */
  async restoreLatest() {
    const latestFile = path.join(this.backupDir, 'latest-backup.json');
    
    if (!fs.existsSync(latestFile)) {
      console.error('❌ No latest backup found');
      return { success: false, error: 'No latest backup' };
    }

    const latestInfo = JSON.parse(fs.readFileSync(latestFile, 'utf8'));
    return this.restoreBackup(latestInfo.backup_file);
  }

  /**
   * List semua backup yang tersedia
   */
  listBackups() {
    try {
      const files = fs.readdirSync(this.backupDir)
        .filter(file => file.startsWith('backup-info-'))
        .map(file => {
          const infoPath = path.join(this.backupDir, file);
          const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
          return {
            file,
            timestamp: info.timestamp,
            type: info.type,
            reason: info.reason,
            size: info.compressed_size,
            compression_ratio: info.compression_ratio,
            info_file: infoPath,
            backup_file: info.compressed_backup_file
          };
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return {
        count: files.length,
        total_size: files.reduce((sum, file) => sum + file.size, 0),
        backups: files
      };

    } catch (error) {
      console.error('❌ Error listing backups:', error);
      return {
        count: 0,
        error: error.message
      };
    }
  }

  /**
   * Verifikasi integritas backup
   */
  verifyBackup(backupFile) {
    try {
      const stats = fs.statSync(backupFile);
      
      // Cek file size
      if (stats.size === 0) {
        return { valid: false, error: 'Empty file' };
      }

      // Cek bisa dibaca
      let content;
      if (backupFile.endsWith('.gz')) {
        const compressed = fs.readFileSync(backupFile);
        content = zlib.gunzipSync(compressed).toString();
      } else {
        content = fs.readFileSync(backupFile, 'utf8');
      }

      // Cek valid JSON
      const data = JSON.parse(content);
      
      // Cek struktur data
      const requiredFields = ['metadata', 'data'];
      const hasRequiredFields = requiredFields.every(field => data[field]);
      
      if (!hasRequiredFields) {
        return { valid: false, error: 'Invalid backup structure' };
      }

      return {
        valid: true,
        size: stats.size,
        timestamp: data.metadata?.backup_timestamp,
        type: data.metadata?.backup_type,
        data_structure: 'valid'
      };

    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Verifikasi semua backup
   */
  verifyAllBackups() {
    const results = {
      total: 0,
      valid: 0,
      invalid: 0,
      details: []
    };

    try {
      const backupFiles = fs.readdirSync(this.backupDir)
        .filter(file => file.includes('backup-compressed-') && file.endsWith('.json.gz'));

      results.total = backupFiles.length;

      backupFiles.forEach(file => {
        const filePath = path.join(this.backupDir, file);
        const verification = this.verifyBackup(filePath);
        
        results.details.push({
          file,
          ...verification
        });

        if (verification.valid) {
          results.valid++;
        } else {
          results.invalid++;
        }
      });

      return results;

    } catch (error) {
      return {
        total: 0,
        error: error.message
      };
    }
  }

  /**
   * Buat backup dan push ke git
   */
  async createGitBackup() {
    try {
      // Buat backup lokal dulu
      const backupResult = await this.createBackup('git', 'git-commit');
      
      if (!backupResult.success) {
        throw new Error('Local backup failed');
      }

      // Commit ke git
      execSync('git add data/backups/*', { cwd: this.rootDir });
      
      const commitMessage = `💾 Auto-backup: ${new Date().toLocaleString()}`;
      execSync(`git commit -m "${commitMessage}"`, { cwd: this.rootDir });
      
      // Push ke remote
      execSync('git push', { cwd: this.rootDir });
      
      console.log('✅ Git backup completed and pushed');
      
      return {
        success: true,
        backup: backupResult,
        git: {
          committed: true,
          pushed: true,
          message: commitMessage
        }
      };

    } catch (error) {
      console.error('❌ Git backup failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Main function
   */
  async run() {
    console.log('💾 Starting backup manager...\n');
    
    const args = process.argv.slice(2);
    
    if (args.includes('--list')) {
      const backups = this.listBackups();
      console.log('📦 Available backups:');
      console.log(`Total: ${backups.count} backups (${(backups.total_size / 1024 / 1024).toFixed(2)} MB)`);
      console.log();
      
      backups.backups.forEach((backup, index) => {
        console.log(`${index + 1}. ${new Date(backup.timestamp).toLocaleString()}`);
        console.log(`   Type: ${backup.type}, Reason: ${backup.reason}`);
        console.log(`   Size: ${(backup.size / 1024).toFixed(1)} KB (${backup.compression_ratio}% compressed)`);
        console.log(`   File: ${backup.backup_file}`);
        console.log();
      });
      
      return backups;
    }
    
    if (args.includes('--verify')) {
      console.log('🔍 Verifying all backups...');
      const verification = this.verifyAllBackups();
      
      console.log(`\n📊 Verification Results:`);
      console.log(`Total: ${verification.total}`);
      console.log(`Valid: ${verification.valid}`);
      console.log(`Invalid: ${verification.invalid}`);
      
      if (verification.invalid > 0) {
        console.log('\n❌ Invalid backups:');
        verification.details
          .filter(b => !b.valid)
          .forEach(b => console.log(`  - ${b.file}: ${b.error}`));
      }
      
      return verification;
    }
    
    if (args.includes('--restore')) {
      const backupIndex = args[args.indexOf('--restore') + 1];
      
      if (backupIndex === 'latest') {
        return this.restoreLatest();
      } else if (backupIndex) {
        const backups = this.listBackups();
        if (backupIndex > 0 && backupIndex <= backups.count) {
          const backup = backups.backups[backupIndex - 1];
          return this.restoreBackup(backup.backup_file);
        } else {
          console.error('❌ Invalid backup index');
          return { success: false, error: 'Invalid index' };
        }
      } else {
        console.error('❌ Please specify backup index or "latest"');
        return { success: false, error: 'No backup specified' };
      }
    }
    
    if (args.includes('--git')) {
      return this.createGitBackup();
    }
    
    // Default: create backup
    return this.createBackup('manual', 'user-requested');
  }
}

// Run if called directly
if (require.main === module) {
  const manager = new BackupManager();
  manager.run().catch(console.error);
}

module.exports = BackupManager;
