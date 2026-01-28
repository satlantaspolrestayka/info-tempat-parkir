// scripts/admin-update-fix.js
class AdminUpdateFix {
  constructor() {
    this.API_ENDPOINT = 'https://api.github.com/repos/{owner}/{repo}/contents/data/pending-updates.json';
    this.CONFIG = {
      REPO_OWNER: 'satlantaspolrestayka',
      REPO_NAME: 'ops-ketupat-progo-2026',
      GITHUB_TOKEN: '' // Will be set from localStorage or prompt
    };
  }

  async submitDataToGitHub(updateData) {
    try {
      // Get existing file content
      const url = `https://api.github.com/repos/${this.CONFIG.REPO_OWNER}/${this.CONFIG.REPO_NAME}/contents/data/pending-updates.json`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `token ${this.CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.status}`);
      }

      const fileData = await response.json();
      const content = atob(fileData.content);
      const updates = JSON.parse(content);
      
      // Add new update
      updates.push({
        ...updateData,
        id: Date.now(),
        status: 'pending',
        submitted_at: new Date().toISOString()
      });
      
      // Update file
      const updateResponse = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.CONFIG.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: `Update parking data for ${updateData.location}`,
          content: btoa(JSON.stringify(updates, null, 2)),
          sha: fileData.sha,
          branch: 'main'
        })
      });

      if (!updateResponse.ok) {
        throw new Error(`Failed to update file: ${updateResponse.status}`);
      }

      return {
        success: true,
        message: 'Data submitted successfully'
      };
    } catch (error) {
      console.error('GitHub API error:', error);
      return {
        success: false,
        message: 'Failed to submit data',
        error: error.message
      };
    }
  }

  // Alternative: Use GitHub Actions API to trigger workflow
  async triggerWorkflow(updateData) {
    try {
      const url = `https://api.github.com/repos/${this.CONFIG.REPO_OWNER}/${this.CONFIG.REPO_NAME}/dispatches`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.CONFIG.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          event_type: 'manual_update',
          client_payload: {
            update: updateData
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger workflow: ${response.status}`);
      }

      return {
        success: true,
        message: 'Workflow triggered successfully'
      };
    } catch (error) {
      console.error('Workflow trigger error:', error);
      return {
        success: false,
        message: 'Failed to trigger workflow',
        error: error.message
      };
    }
  }

  // Fallback: Save to localStorage and sync later
  async queueForLater(updateData) {
    try {
      const queueKey = 'parking_update_queue';
      let queue = JSON.parse(localStorage.getItem(queueKey) || '[]');
      
      queue.push({
        ...updateData,
        queued_at: new Date().toISOString(),
        attempts: 0
      });
      
      localStorage.setItem(queueKey, JSON.stringify(queue));
      
      // Try to sync in background
      this.syncQueueInBackground();
      
      return {
        success: true,
        message: 'Data queued for later sync',
        queueLength: queue.length
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to queue data',
        error: error.message
      };
    }
  }

  async syncQueueInBackground() {
    if ('serviceWorker' in navigator && 'sync' in registration) {
      try {
        await registration.sync.register('sync-parking-updates');
        console.log('Background sync registered');
      } catch (error) {
        console.error('Background sync failed:', error);
      }
    }
  }

  // Main submit function for admin panel
  async submitUpdate(updateData) {
    // Try GitHub API first
    if (this.CONFIG.GITHUB_TOKEN) {
      const result = await this.submitDataToGitHub(updateData);
      if (result.success) return result;
    }
    
    // Fallback to queue
    return await this.queueForLater(updateData);
  }
}

// Export for use in admin-petugas.html
window.ParkingUpdateAPI = new AdminUpdateFix();
