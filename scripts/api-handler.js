// scripts/api-handler.js
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class APIHandler {
  constructor() {
    this.pendingPath = path.join(__dirname, '../data/pending-updates.json');
    this.logDir = path.join(__dirname, '../data/logs/api');
    this.ensureDirectories();
  }

  ensureDirectories() {
    [this.logDir].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  async logAPIRequest(request) {
    const logFile = path.join(this.logDir, `api-${new Date().toISOString().split('T')[0]}.log`);
    const logEntry = {
      timestamp: new Date().toISOString(),
      ip: request.ip || 'unknown',
      method: request.method,
      endpoint: request.url,
      userAgent: request.headers['user-agent'],
      body: request.body
    };
    
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n').catch(() => {});
  }

  validateRequest(body) {
    const errors = [];
    
    // Required fields
    if (!body.location) errors.push('location is required');
    if (!body.petugas_name) errors.push('petugas_name is required');
    if (!body.timestamp) errors.push('timestamp is required');
    
    // Data validation
    if (body.data) {
      if (body.data.bus !== undefined && (isNaN(body.data.bus) || body.data.bus < 0)) {
        errors.push('bus must be a non-negative number');
      }
      if (body.data.mobil !== undefined && (isNaN(body.data.mobil) || body.data.mobil < 0)) {
        errors.push('mobil must be a non-negative number');
      }
      if (body.data.motor !== undefined && (isNaN(body.data.motor) || body.data.motor < 0)) {
        errors.push('motor must be a non-negative number');
      }
    } else {
      errors.push('data object is required');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }

  async addUpdate(updateData) {
    try {
      // Generate unique ID
      updateData.id = crypto.randomBytes(8).toString('hex');
      updateData.received_at = new Date().toISOString();
      updateData.status = 'pending';
      
      // Load existing updates
      let updates = [];
      try {
        const content = await fs.readFile(this.pendingPath, 'utf8');
        updates = JSON.parse(content);
      } catch {
        // File doesn't exist or is empty
      }
      
      // Add new update
      updates.push(updateData);
      
      // Save back to file
      await fs.writeFile(this.pendingPath, JSON.stringify(updates, null, 2));
      
      return {
        success: true,
        message: 'Update added to queue',
        id: updateData.id,
        queuePosition: updates.length
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to add update',
        error: error.message
      };
    }
  }

  async handleRequest(request) {
    // Log the request
    await this.logAPIRequest(request);
    
    // Validate method
    if (request.method !== 'POST') {
      return {
        status: 405,
        body: { error: 'Method not allowed' }
      };
    }
    
    // Parse and validate body
    let body;
    try {
      body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
    } catch {
      return {
        status: 400,
        body: { error: 'Invalid JSON' }
      };
    }
    
    // Validate request data
    const validation = this.validateRequest(body);
    if (!validation.isValid) {
      return {
        status: 400,
        body: { error: 'Validation failed', details: validation.errors }
      };
    }
    
    // Add to pending updates
    const result = await this.addUpdate(body);
    
    if (result.success) {
      return {
        status: 201,
        body: result
      };
    } else {
      return {
        status: 500,
        body: result
      };
    }
  }
}

module.exports = APIHandler;
