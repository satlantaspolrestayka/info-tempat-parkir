// scripts/validate-updates.js
const fs = require('fs');
const path = require('path');

async function validateAndCleanUpdates() {
  const pendingPath = path.join(process.cwd(), 'data/pending-updates.json');
  
  if (!fs.existsSync(pendingPath)) {
    console.log('No pending updates file found');
    return { valid: 0, invalid: 0, cleaned: [] };
  }
  const parkirDataPath = path.join(process.cwd(), 'data/parkir-data.json');
let validLocations = [];
if (fs.existsSync(parkirDataPath)) {
  const parkirData = JSON.parse(fs.readFileSync(parkirDataPath, 'utf8'));
  validLocations = parkirData.locations.map(l => l.nama);
}
  let updates = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
  const originalCount = updates.length;
  
  const validUpdates = [];
  const invalidUpdates = [];
  
  // Validation rules
  updates.forEach(update => {
    const errors = [];
    
    // Required fields
    if (!update.location_id || typeof update.location_id !== 'string') {
      errors.push('Missing or invalid location_id');
    }
    if (update.location_id && !validLocations.includes(update.location_id)) {
  errors.push(`Invalid location_id: ${update.location_id}`);
    }
    if (!update.petugas_name || typeof update.petugas_name !== 'string') {
      errors.push('Missing or invalid petugas_name');
    }
    
    // Numeric validations
    if (update.bus !== undefined && (isNaN(update.bus) || update.bus < 0)) {
      errors.push('Invalid bus value');
    }
    
    if (update.mobil !== undefined && (isNaN(update.mobil) || update.mobil < 0)) {
      errors.push('Invalid mobil value');
    }
    
    if (update.motor !== undefined && (isNaN(update.motor) || update.motor < 0)) {
      errors.push('Invalid motor value');
    }
    
    // Timestamp validation
    if (update.timestamp && isNaN(new Date(update.timestamp).getTime())) {
      errors.push('Invalid timestamp');
    }
    
    if (errors.length === 0) {
      // Clean data
      const cleanedUpdate = {
        location_id: update.location_id.trim(),
        petugas_name: update.petugas_name.trim(),
        timestamp: update.timestamp || new Date().toISOString(),
        status: 'pending'
      };
      
      if (update.bus !== undefined) cleanedUpdate.bus = parseInt(update.bus);
      if (update.mobil !== undefined) cleanedUpdate.mobil = parseInt(update.mobil);
      if (update.motor !== undefined) cleanedUpdate.motor = parseInt(update.motor);
      if (update.notes) cleanedUpdate.notes = update.notes.substring(0, 500); // Limit length
      
      validUpdates.push(cleanedUpdate);
    } else {
      invalidUpdates.push({
        original: update,
        errors,
        failed_at: new Date().toISOString()
      });
    }
  });
  
  // Save cleaned updates
  fs.writeFileSync(pendingPath, JSON.stringify(validUpdates, null, 2));
  
  // Archive invalid updates for debugging
  if (invalidUpdates.length > 0) {
    const invalidDir = path.join(process.cwd(), 'data/updates/invalid');
    if (!fs.existsSync(invalidDir)) {
      fs.mkdirSync(invalidDir, { recursive: true });
    }
    
    const invalidFile = path.join(invalidDir, `invalid-${Date.now()}.json`);
    fs.writeFileSync(invalidFile, JSON.stringify(invalidUpdates, null, 2));
  }
  
  console.log(`✅ Validated updates: ${validUpdates.length} valid, ${invalidUpdates.length} invalid`);
  
  return {
    valid: validUpdates.length,
    invalid: invalidUpdates.length,
    cleaned: validUpdates
  };
}

module.exports = { validateAndCleanUpdates };
