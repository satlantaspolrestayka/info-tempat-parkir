[file name]: validate-updates.js
[file content begin]
#!/usr/bin/env node
/**
 * Script untuk validasi dan pembersihan data update
 * Terintegrasi dengan locations-config.json
 */

const fs = require('fs');
const path = require('path');

class UpdatesValidator {
  constructor() {
    this.rootDir = path.join(__dirname, '..');
    this.pendingPath = path.join(this.rootDir, 'data/pending-updates.json');
    this.dataPath = path.join(this.rootDir, 'data/parkir-data.json');
    this.configPath = path.join(this.rootDir, 'config/locations-config.json');
    
    this.validLocations = [];
    this.locationMap = {};
    
    // Load data
    this.loadData();
  }
  
  loadData() {
    try {
      // Load parkir data
      if (fs.existsSync(this.dataPath)) {
        const parkirData = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
        this.validLocations = parkirData.locations.map(l => l.id);
        
        // Create location map for quick lookup
        parkirData.locations.forEach(location => {
          this.locationMap[location.id] = {
            nama: location.nama,
            code: location.nama.replace(/\s+/g, '').toUpperCase(),
            capacity: {
              bus: location.bus?.total || 0,
              mobil: location.mobil?.total || 0,
              motor: location.motor?.total || 0
            }
          };
        });
      }
      
      // Load config for additional validation
      if (fs.existsSync(this.configPath)) {
        const configData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
        
        // Update location map with config data
        configData.locations?.forEach(configLoc => {
          if (this.locationMap[configLoc.id]) {
            this.locationMap[configLoc.id].configCapacity = configLoc.capacity;
            this.locationMap[configLoc.id].code = configLoc.code;
          }
        });
      }
      
    } catch (error) {
      console.error('❌ Error loading data:', error.message);
    }
  }
  
  async validateAndCleanUpdates() {
    console.log('🔍 Validating pending updates...');
    
    if (!fs.existsSync(this.pendingPath)) {
      console.log('📭 No pending updates file found');
      return { valid: 0, invalid: 0, cleaned: [] };
    }
    
    let updates = [];
    try {
      updates = JSON.parse(fs.readFileSync(this.pendingPath, 'utf8'));
    } catch (error) {
      console.error('❌ Error reading pending updates:', error.message);
      return { valid: 0, invalid: 0, cleaned: [] };
    }
    
    const originalCount = updates.length;
    const validUpdates = [];
    const invalidUpdates = [];
    
    console.log(`📋 Found ${originalCount} updates to validate`);
    
    // Validation rules
    updates.forEach((update, index) => {
      const errors = [];
      const warnings = [];
      
      // Required fields validation
      if (!update.location_id || typeof update.location_id !== 'number') {
        errors.push('Missing or invalid location_id (must be number)');
      }
      
      if (!update.petugas_name || typeof update.petugas_name !== 'string') {
        errors.push('Missing or invalid petugas_name');
      }
      
      // Location existence check
      if (update.location_id && !this.validLocations.includes(update.location_id)) {
        errors.push(`Invalid location_id: ${update.location_id} not found in parkir data`);
      }
      
      // Get location info
      const locationInfo = this.locationMap[update.location_id];
      
      // Numeric validations with capacity limits
      if (update.bus !== undefined) {
        const busValue = parseInt(update.bus);
        if (isNaN(busValue) || busValue < 0) {
          errors.push('Invalid bus value (must be non-negative number)');
        } else if (locationInfo) {
          const maxCapacity = locationInfo.configCapacity?.bus?.total || locationInfo.capacity.bus;
          if (maxCapacity > 0 && busValue > maxCapacity) {
            warnings.push(`Bus value ${busValue} exceeds capacity ${maxCapacity}`);
            // Auto-correct if possible
            if (this.shouldAutoCorrect()) {
              update.bus = maxCapacity;
              console.log(`⚠️ Auto-corrected bus value for location ${update.location_id}: ${busValue} → ${maxCapacity}`);
            }
          }
        }
      }
      
      if (update.mobil !== undefined) {
        const mobilValue = parseInt(update.mobil);
        if (isNaN(mobilValue) || mobilValue < 0) {
          errors.push('Invalid mobil value (must be non-negative number)');
        } else if (locationInfo) {
          const maxCapacity = locationInfo.configCapacity?.mobil?.total || locationInfo.capacity.mobil;
          if (maxCapacity > 0 && mobilValue > maxCapacity) {
            warnings.push(`Mobil value ${mobilValue} exceeds capacity ${maxCapacity}`);
            // Auto-correct if possible
            if (this.shouldAutoCorrect()) {
              update.mobil = maxCapacity;
              console.log(`⚠️ Auto-corrected mobil value for location ${update.location_id}: ${mobilValue} → ${maxCapacity}`);
            }
          }
        }
      }
      
      if (update.motor !== undefined) {
        const motorValue = parseInt(update.motor);
        if (isNaN(motorValue) || motorValue < 0) {
          errors.push('Invalid motor value (must be non-negative number)');
        } else if (locationInfo) {
          const maxCapacity = locationInfo.configCapacity?.motor?.total || locationInfo.capacity.motor;
          if (maxCapacity > 0 && motorValue > maxCapacity) {
            warnings.push(`Motor value ${motorValue} exceeds capacity ${maxCapacity}`);
            // Auto-correct if possible
            if (this.shouldAutoCorrect()) {
              update.motor = maxCapacity;
              console.log(`⚠️ Auto-corrected motor value for location ${update.location_id}: ${motorValue} → ${maxCapacity}`);
            }
          }
        }
      }
      
      // Timestamp validation
      if (update.timestamp) {
        const timestamp = new Date(update.timestamp);
        if (isNaN(timestamp.getTime())) {
          errors.push('Invalid timestamp format');
        } else if (timestamp > new Date()) {
          warnings.push('Timestamp is in the future');
        }
      }
      
      // Notes length validation
      if (update.notes && update.notes.length > 500) {
        warnings.push('Notes too long (truncated to 500 chars)');
        update.notes = update.notes.substring(0, 500);
      }
      
      if (errors.length === 0) {
        // Clean data
        const cleanedUpdate = {
          location_id: update.location_id,
          location_name: locationInfo?.nama || `Location_${update.location_id}`,
          location_code: locationInfo?.code || `LOC${update.location_id}`,
          petugas_name: update.petugas_name.trim(),
          timestamp: update.timestamp || new Date().toISOString(),
          status: 'pending',
          validated_at: new Date().toISOString()
        };
        
        // Add vehicle data if present
        if (update.bus !== undefined) cleanedUpdate.bus = parseInt(update.bus);
        if (update.mobil !== undefined) cleanedUpdate.mobil = parseInt(update.mobil);
        if (update.motor !== undefined) cleanedUpdate.motor = parseInt(update.motor);
        if (update.notes) cleanedUpdate.notes = update.notes.trim();
        
        // Add warnings if any
        if (warnings.length > 0) {
          cleanedUpdate.warnings = warnings;
        }
        
        validUpdates.push(cleanedUpdate);
        
        if (warnings.length > 0) {
          console.log(`⚠️ Location ${update.location_id}: ${warnings.join(', ')}`);
        }
      } else {
        invalidUpdates.push({
          original: update,
          errors,
          warnings,
          failed_at: new Date().toISOString()
        });
        
        console.log(`❌ Invalid update for location ${update.location_id}:`, errors.join(', '));
      }
    });
    
    // Save cleaned updates
    if (validUpdates.length > 0) {
      fs.writeFileSync(this.pendingPath, JSON.stringify(validUpdates, null, 2));
      console.log(`✅ Saved ${validUpdates.length} valid updates`);
    } else {
      // If no valid updates, write empty array
      fs.writeFileSync(this.pendingPath, JSON.stringify([], null, 2));
    }
    
    // Archive invalid updates for debugging
    if (invalidUpdates.length > 0) {
      this.archiveInvalidUpdates(invalidUpdates);
    }
    
    console.log(`\n📊 VALIDATION SUMMARY:`);
    console.log(`   Total: ${originalCount}`);
    console.log(`   ✅ Valid: ${validUpdates.length}`);
    console.log(`   ❌ Invalid: ${invalidUpdates.length}`);
    console.log(`   📁 Saved to: ${this.pendingPath}`);
    
    return {
      valid: validUpdates.length,
      invalid: invalidUpdates.length,
      cleaned: validUpdates
    };
  }
  
  shouldAutoCorrect() {
    // Auto-correct only if not in strict mode
    return !process.argv.includes('--strict');
  }
  
  archiveInvalidUpdates(invalidUpdates) {
    try {
      const invalidDir = path.join(this.rootDir, 'data/updates/invalid');
      if (!fs.existsSync(invalidDir)) {
        fs.mkdirSync(invalidDir, { recursive: true });
      }
      
      const invalidFile = path.join(invalidDir, `invalid-${Date.now()}.json`);
      fs.writeFileSync(invalidFile, JSON.stringify(invalidUpdates, null, 2));
      
      console.log(`📁 Archived ${invalidUpdates.length} invalid updates to: ${invalidFile}`);
      
    } catch (error) {
      console.error('❌ Failed to archive invalid updates:', error.message);
    }
  }
  
  /**
   * Quick check for updates integrity
   */
  async quickCheck() {
    console.log('🔍 Quick check of pending updates...');
    
    if (!fs.existsSync(this.pendingPath)) {
      console.log('✅ No pending updates to check');
      return { status: 'clean', count: 0 };
    }
    
    try {
      const updates = JSON.parse(fs.readFileSync(this.pendingPath, 'utf8'));
      
      // Basic integrity checks
      let errorCount = 0;
      let warningCount = 0;
      
      updates.forEach(update => {
        if (!update.location_id || !update.petugas_name) {
          errorCount++;
        }
        
        // Check for extreme values
        if (update.bus > 1000 || update.mobil > 1000 || update.motor > 1000) {
          warningCount++;
        }
      });
      
      if (errorCount === 0 && warningCount === 0) {
        console.log(`✅ All ${updates.length} updates look good`);
        return { status: 'clean', count: updates.length };
      } else {
        console.log(`⚠️ Found ${errorCount} errors and ${warningCount} warnings in ${updates.length} updates`);
        return { 
          status: 'issues', 
          count: updates.length,
          errors: errorCount,
          warnings: warningCount
        };
      }
      
    } catch (error) {
      console.error('❌ Error during quick check:', error.message);
      return { status: 'error', error: error.message };
    }
  }
}

// Main execution
(async () => {
  try {
    const validator = new UpdatesValidator();
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    
    if (args.includes('--quick')) {
      await validator.quickCheck();
    } else if (args.includes('--clean')) {
      await validator.validateAndCleanUpdates();
    } else {
      // Default: validate and clean
      const result = await validator.validateAndCleanUpdates();
      
      if (result.invalid > 0) {
        process.exit(1); // Exit with error if invalid updates found
      }
    }
    
  } catch (error) {
    console.error('💥 Unexpected error:', error);
    process.exit(1);
  }
})();

module.exports = UpdatesValidator;
[file content end]
