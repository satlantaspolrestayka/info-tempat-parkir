// scripts/process-updates.js
const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');

class UpdateProcessor {
  constructor() {
    this.dataPath = path.join(__dirname, '../data/parkir-data.json');
    this.pendingPath = path.join(__dirname, '../data/pending-updates.json');
    this.backupDir = path.join(__dirname, '../data/backups');
    this.archiveDir = path.join(__dirname, '../data/updates/archive');
    this.logDir = path.join(__dirname, '../data/logs');
    
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.backupDir, this.archiveDir, this.logDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async log(message, level = 'info', data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...(data && { data }) };
    
    // Console output
    const colors = { error: '\x1b[31m', warn: '\x1b[33m', info: '\x1b[36m', reset: '\x1b[0m' };
    console.log(`${colors[level] || ''}[${timestamp}] ${level.toUpperCase()}: ${message}${colors.reset}`);
    
    // File log
    const logFile = path.join(this.logDir, `process-${new Date().toISOString().split('T')[0]}.log`);
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n').catch(() => {});
  }

  async createBackup() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = path.join(this.backupDir, `backup-${timestamp}.json`);
      
      const data = await fs.readFile(this.dataPath, 'utf8');
      await fs.writeFile(backupFile, data);
      
      await this.log('Backup created', 'info', { file: backupFile });
      
      // Clean old backups (keep last 10)
      const backups = (await fs.readdir(this.backupDir))
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .map(f => ({ name: f, path: path.join(this.backupDir, f) }))
        .sort()
        .reverse();
      
      if (backups.length > 10) {
        for (const backup of backups.slice(10)) {
          await fs.unlink(backup.path);
          await this.log('Removed old backup', 'info', { file: backup.name });
        }
      }
    } catch (error) {
      await this.log('Backup failed', 'error', { error: error.message });
      throw error;
    }
  }

  async loadData() {
    try {
      const [dataContent, pendingContent] = await Promise.all([
        fs.readFile(this.dataPath, 'utf8'),
        fs.readFile(this.pendingPath, 'utf8').catch(() => '[]')
      ]);

      const data = JSON.parse(dataContent);
      const pendingUpdates = JSON.parse(pendingContent);

      // Validate data structure
      if (!data.locations || !Array.isArray(data.locations)) {
        throw new Error('Invalid data structure: missing locations array');
      }

      await this.log('Data loaded', 'info', {
        locations: data.locations.length,
        pendingUpdates: pendingUpdates.length
      });

      return { data, pendingUpdates };
    } catch (error) {
      await this.log('Failed to load data', 'error', { error: error.message });
      throw error;
    }
  }

  validateUpdate(update, location) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!update.location || !update.timestamp) {
      errors.push('Missing required fields (location, timestamp)');
    }

    // Validate vehicle data
    const validateVehicle = (type, value, maxCapacity) => {
      if (value === undefined || value === null) return;
      
      const numValue = parseInt(value);
      if (isNaN(numValue)) {
        errors.push(`${type}: Invalid number (${value})`);
        return null;
      }
      
      if (numValue < 0) {
        errors.push(`${type}: Negative value (${numValue})`);
        return null;
      }
      
      if (numValue > maxCapacity) {
        warnings.push(`${type}: ${numValue} exceeds capacity ${maxCapacity}, capping to max`);
        return maxCapacity;
      }
      
      return numValue;
    };

    const processedData = {};
    
    if (update.data.bus !== undefined && location.bus.total > 0) {
      const validValue = validateVehicle('bus', update.data.bus, location.bus.total);
      if (validValue !== null) processedData.bus = validValue;
    }

    if (update.data.mobil !== undefined && location.mobil.total > 0) {
      const validValue = validateVehicle('mobil', update.data.mobil, location.mobil.total);
      if (validValue !== null) processedData.mobil = validValue;
    }

    if (update.data.motor !== undefined && location.motor.total > 0) {
      const validValue = validateVehicle('motor', update.data.motor, location.motor.total);
      if (validValue !== null) processedData.motor = validValue;
    }

    return { 
      isValid: errors.length === 0,
      errors, 
      warnings, 
      processedData 
    };
  }

  async processUpdates() {
    await this.log('Starting update processing');
    
    try {
      // Create backup first
      await this.createBackup();
      
      // Load data
      const { data, pendingUpdates } = await this.loadData();
      
      // Filter unprocessed updates
      const unprocessed = pendingUpdates.filter(u => 
        !u.processed_at && u.status !== 'processed'
      );
      
      if (unprocessed.length === 0) {
        await this.log('No updates to process');
        return { 
          processed: 0, 
          failed: 0, 
          updatedLocations: [],
          hasChanges: false 
        };
      }

      await this.log(`Processing ${unprocessed.length} updates`, 'info');

      const results = {
        processed: [],
        failed: [],
        updatedLocations: new Set()
      };

      // Process each update
      for (const update of unprocessed) {
        try {
          // Find location
          const location = data.locations.find(l => l.nama === update.location);
          if (!location) {
            throw new Error(`Location not found: ${update.location}`);
          }

          // Validate update
          const validation = this.validateUpdate(update, location);
          
          if (!validation.isValid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }

          // Apply updates
          let changesMade = false;
          
          if (validation.processedData.bus !== undefined && 
              location.bus.available !== validation.processedData.bus) {
            location.bus.available = validation.processedData.bus;
            location.bus.last_update = new Date().toISOString();
            location.bus.updated_by = update.petugas_name || 'system';
            changesMade = true;
          }

          if (validation.processedData.mobil !== undefined && 
              location.mobil.available !== validation.processedData.mobil) {
            location.mobil.available = validation.processedData.mobil;
            location.mobil.last_update = new Date().toISOString();
            location.mobil.updated_by = update.petugas_name || 'system';
            changesMade = true;
          }

          if (validation.processedData.motor !== undefined && 
              location.motor.available !== validation.processedData.motor) {
            location.motor.available = validation.processedData.motor;
            location.motor.last_update = new Date().toISOString();
            location.motor.updated_by = update.petugas_name || 'system';
            changesMade = true;
          }

          if (update.notes && update.notes.trim()) {
            location.notes = update.notes.trim().substring(0, 500);
          }

          if (changesMade) {
            results.updatedLocations.add(location.nama);
            update.status = 'processed';
            update.processed_at = new Date().toISOString();
            update.validation_warnings = validation.warnings;
            results.processed.push(update);
            
            await this.log(`Updated ${location.nama}`, 'info', {
              bus: validation.processedData.bus,
              mobil: validation.processedData.mobil,
              motor: validation.processedData.motor
            });
          } else {
            update.status = 'no_changes';
            update.processed_at = new Date().toISOString();
            results.processed.push(update);
            await this.log(`No changes for ${location.nama}`, 'info');
          }

        } catch (error) {
          update.status = 'failed';
          update.error = error.message;
          update.failed_at = new Date().toISOString();
          results.failed.push(update);
          
          await this.log(`Failed to process update for ${update.location}`, 'error', {
            error: error.message
          });
        }
      }

      // Update pending file
      const updatedPending = pendingUpdates.map(pending => {
        const processed = results.processed.find(p => 
          p.location === pending.location && 
          p.timestamp === pending.timestamp
        );
        const failed = results.failed.find(f => 
          f.location === pending.location && 
          f.timestamp === pending.timestamp
        );
        return processed || failed || pending;
      });

      // Update statistics if changes were made
      if (results.updatedLocations.size > 0) {
        this.updateStatistics(data);
        data.metadata.last_updated = new Date().toISOString();
        data.metadata.updated_by = 'GitHub Actions';
        data.metadata.processing_timestamp = new Date().toISOString();
      }

      // Save all data
      await Promise.all([
        fs.writeFile(this.dataPath, JSON.stringify(data, null, 2)),
        fs.writeFile(this.pendingPath, JSON.stringify(updatedPending, null, 2))
      ]);

      // Archive processed updates
      if (results.processed.length > 0) {
        await this.archiveUpdates(results.processed);
      }

      await this.log('Processing completed', 'info', {
        processed: results.processed.length,
        failed: results.failed.length,
        updatedLocations: Array.from(results.updatedLocations)
      });

      return {
        processed: results.processed.length,
        failed: results.failed.length,
        updatedLocations: Array.from(results.updatedLocations),
        hasChanges: results.updatedLocations.size > 0
      };

    } catch (error) {
      await this.log('Processing failed', 'error', { error: error.message });
      throw error;
    }
  }

  updateStatistics(data) {
    const stats = data.locations.reduce((acc, loc) => {
      acc.bus += loc.bus.available || 0;
      acc.mobil += loc.mobil.available || 0;
      acc.motor += loc.motor.available || 0;
      return acc;
    }, { bus: 0, mobil: 0, motor: 0 });

    // Validate against total capacity
    const totalCapacity = data.locations.reduce((acc, loc) => {
      acc.bus += loc.bus.total || 0;
      acc.mobil += loc.mobil.total || 0;
      acc.motor += loc.motor.total || 0;
      return acc;
    }, { bus: 0, mobil: 0, motor: 0 });

    // Ensure available doesn't exceed capacity
    stats.bus = Math.min(stats.bus, totalCapacity.bus);
    stats.mobil = Math.min(stats.mobil, totalCapacity.mobil);
    stats.motor = Math.min(stats.motor, totalCapacity.motor);

    data.statistics = {
      total_bus_capacity: totalCapacity.bus,
      total_mobil_capacity: totalCapacity.mobil,
      total_motor_capacity: totalCapacity.motor,
      total_available_bus: stats.bus,
      total_available_mobil: stats.mobil,
      total_available_motor: stats.motor,
      update_count_today: (data.statistics?.update_count_today || 0) + 1,
      last_processed: new Date().toISOString(),
      utilization: {
        bus: totalCapacity.bus > 0 ? ((totalCapacity.bus - stats.bus) / totalCapacity.bus * 100).toFixed(1) : "0.0",
        mobil: totalCapacity.mobil > 0 ? ((totalCapacity.mobil - stats.mobil) / totalCapacity.mobil * 100).toFixed(1) : "0.0",
        motor: totalCapacity.motor > 0 ? ((totalCapacity.motor - stats.motor) / totalCapacity.motor * 100).toFixed(1) : "0.0"
      }
    };
  }

  async archiveUpdates(updates) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const archiveFile = path.join(this.archiveDir, `updates-${today}.json`);
      
      let existingData = [];
      try {
        const content = await fs.readFile(archiveFile, 'utf8');
        existingData = JSON.parse(content);
      } catch {
        // File doesn't exist, start fresh
      }
      
      existingData.push(...updates);
      await fs.writeFile(archiveFile, JSON.stringify(existingData, null, 2));
      
      await this.log('Updates archived', 'info', { file: archiveFile, count: updates.length });
    } catch (error) {
      await this.log('Archive failed', 'warn', { error: error.message });
    }
  }
}

// Main execution
if (require.main === module) {
  (async () => {
    try {
      const processor = new UpdateProcessor();
      const result = await processor.processUpdates();
      
      // Output for GitHub Actions
      console.log(`::set-output name=processed_count::${result.processed}`);
      console.log(`::set-output name=failed_count::${result.failed}`);
      console.log(`::set-output name=updated_locations::${result.updatedLocations.join(',')}`);
      console.log(`::set-output name=has_changes::${result.hasChanges}`);
      
      process.exit(0);
    } catch (error) {
      console.error('Fatal error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = UpdateProcessor;
