// Système de statistiques avancées
class StatsManager {
  constructor() {
    this.stats = {
      session: {
        startTime: Date.now(),
        totalSyncs: 0,
        totalFiles: 0,
        totalBytes: 0,
        errors: 0
      },
      files: {
        byExtension: new Map(),
        largest: { name: '', size: 0 },
        mostActive: { name: '', changes: 0 }
      },
      clients: {
        peak: 0,
        current: 0,
        totalConnections: 0
      },
      performance: {
        avgSyncTime: 0,
        syncTimes: [],
        memoryUsage: []
      }
    };
    
    // Monitoring de la mémoire toutes les 30 secondes
    setInterval(() => this.recordMemoryUsage(), 30000);
  }

  // Enregistrer une synchronisation
  recordSync(fileName, fileSize, syncTime) {
    this.stats.session.totalSyncs++;
    this.stats.session.totalBytes += fileSize;
    
    // Statistiques par extension
    const ext = fileName.split('.').pop() || 'no-ext';
    const extStats = this.stats.files.byExtension.get(ext) || { count: 0, size: 0 };
    extStats.count++;
    extStats.size += fileSize;
    this.stats.files.byExtension.set(ext, extStats);
    
    // Plus gros fichier
    if (fileSize > this.stats.files.largest.size) {
      this.stats.files.largest = { name: fileName, size: fileSize };
    }
    
    // Performance
    this.stats.performance.syncTimes.push(syncTime);
    if (this.stats.performance.syncTimes.length > 100) {
      this.stats.performance.syncTimes.shift(); // Garder seulement les 100 derniers
    }
    this.updateAvgSyncTime();
  }

  // Mettre à jour le nombre de clients
  updateClientCount(count) {
    this.stats.clients.current = count;
    if (count > this.stats.clients.peak) {
      this.stats.clients.peak = count;
    }
  }

  // Enregistrer une connexion
  recordConnection() {
    this.stats.clients.totalConnections++;
  }

  // Enregistrer une erreur
  recordError() {
    this.stats.session.errors++;
  }

  // Enregistrer l'utilisation mémoire
  recordMemoryUsage() {
    const usage = process.memoryUsage();
    this.stats.performance.memoryUsage.push({
      timestamp: Date.now(),
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024)
    });
    
    // Garder seulement les 24 dernières heures (2880 points à 30s d'intervalle)
    if (this.stats.performance.memoryUsage.length > 2880) {
      this.stats.performance.memoryUsage.shift();
    }
  }

  // Calculer le temps moyen de sync
  updateAvgSyncTime() {
    const times = this.stats.performance.syncTimes;
    if (times.length > 0) {
      this.stats.performance.avgSyncTime = 
        times.reduce((a, b) => a + b, 0) / times.length;
    }
  }

  // Obtenir un rapport complet
  getReport() {
    const uptime = Date.now() - this.stats.session.startTime;
    const uptimeHours = Math.round(uptime / 1000 / 60 / 60 * 100) / 100;
    
    return {
      uptime: `${uptimeHours}h`,
      totalSyncs: this.stats.session.totalSyncs,
      totalBytes: this.formatBytes(this.stats.session.totalBytes),
      avgSyncTime: `${Math.round(this.stats.performance.avgSyncTime)}ms`,
      peakClients: this.stats.clients.peak,
      errors: this.stats.session.errors,
      topExtensions: this.getTopExtensions(),
      largestFile: this.stats.files.largest,
      currentMemory: this.getCurrentMemory()
    };
  }

  // Top 5 des extensions
  getTopExtensions() {
    return Array.from(this.stats.files.byExtension.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([ext, stats]) => ({ ext, count: stats.count, size: this.formatBytes(stats.size) }));
  }

  // Mémoire actuelle
  getCurrentMemory() {
    const latest = this.stats.performance.memoryUsage.slice(-1)[0];
    return latest ? `${latest.heapUsed}MB` : '0MB';
  }

  // Formater les bytes
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

module.exports = StatsManager; 