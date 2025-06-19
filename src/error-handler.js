// Gestionnaire d'erreurs centralisé
const { app } = require('electron');

class ErrorHandler {
  constructor() {
    this.errors = [];
    this.maxErrors = 100;
    this.listeners = new Set();
    
    // Capturer les erreurs non gérées
    process.on('uncaughtException', (error) => {
      this.handleCriticalError('uncaughtException', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      this.handleCriticalError('unhandledRejection', reason);
    });
  }
  
  // Gérer les erreurs critiques
  handleCriticalError(type, error) {
    console.error(`🚨 ERREUR CRITIQUE [${type}]:`, error);
    
    this.logError({
      type: 'critical',
      source: type,
      message: error.message || error,
      stack: error.stack,
      timestamp: Date.now()
    });
    
    // Notifier les listeners
    this.notifyListeners({
      type: 'critical',
      error: error
    });
  }
  
  // Gérer les erreurs normales
  handleError(source, error, context = {}) {
    const errorInfo = {
      type: 'error',
      source: source,
      message: error.message || error,
      stack: error.stack,
      context: context,
      timestamp: Date.now()
    };
    
    console.error(`❌ [${source}]:`, errorInfo.message);
    
    this.logError(errorInfo);
    this.notifyListeners(errorInfo);
    
    return errorInfo;
  }
  
  // Gérer les avertissements
  handleWarning(source, message, context = {}) {
    const warningInfo = {
      type: 'warning',
      source: source,
      message: message,
      context: context,
      timestamp: Date.now()
    };
    
    console.warn(`⚠️ [${source}]:`, message);
    
    this.logError(warningInfo);
    this.notifyListeners(warningInfo);
    
    return warningInfo;
  }
  
  // Logger les erreurs
  logError(errorInfo) {
    this.errors.push(errorInfo);
    
    // Garder seulement les N dernières erreurs
    if (this.errors.length > this.maxErrors) {
      this.errors = this.errors.slice(-this.maxErrors);
    }
  }
  
  // Ajouter un listener d'erreurs
  addListener(callback) {
    this.listeners.add(callback);
  }
  
  // Supprimer un listener
  removeListener(callback) {
    this.listeners.delete(callback);
  }
  
  // Notifier tous les listeners
  notifyListeners(errorInfo) {
    this.listeners.forEach(callback => {
      try {
        callback(errorInfo);
      } catch (err) {
        console.error('Erreur dans listener d\'erreur:', err);
      }
    });
  }
  
  // Obtenir les erreurs récentes
  getRecentErrors(limit = 20) {
    return this.errors.slice(-limit);
  }
  
  // Obtenir les statistiques d'erreurs
  getErrorStats() {
    const stats = {
      total: this.errors.length,
      critical: 0,
      errors: 0,
      warnings: 0,
      bySources: {}
    };
    
    this.errors.forEach(error => {
      stats[error.type]++;
      
      if (!stats.bySources[error.source]) {
        stats.bySources[error.source] = 0;
      }
      stats.bySources[error.source]++;
    });
    
    return stats;
  }
  
  // Nettoyer les anciennes erreurs
  clearOldErrors(maxAge = 24 * 60 * 60 * 1000) { // 24h par défaut
    const cutoff = Date.now() - maxAge;
    this.errors = this.errors.filter(error => error.timestamp > cutoff);
  }
  
  // Wrapper pour les fonctions async
  wrapAsync(source, asyncFn) {
    return async (...args) => {
      try {
        return await asyncFn(...args);
      } catch (error) {
        this.handleError(source, error, { args });
        throw error;
      }
    };
  }
  
  // Wrapper pour les fonctions sync
  wrapSync(source, syncFn) {
    return (...args) => {
      try {
        return syncFn(...args);
      } catch (error) {
        this.handleError(source, error, { args });
        throw error;
      }
    };
  }
}

// Instance singleton
const errorHandler = new ErrorHandler();

module.exports = ErrorHandler;
module.exports.instance = errorHandler; 