// Gestionnaire IPC centralisé
const { ipcMain } = require('electron');
const { instance: errorHandler } = require('./error-handler');

class IPCManager {
  constructor() {
    this.handlers = new Map();
    this.middlewares = [];
    this.stats = {
      callsTotal: 0,
      callsSuccess: 0,
      callsError: 0,
      averageResponseTime: 0
    };
  }
  
  // Ajouter un middleware
  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }
  
  // Enregistrer un handler avec validation
  handle(channel, handler, options = {}) {
    if (this.handlers.has(channel)) {
      errorHandler.handleWarning('IPC', `Handler '${channel}' déjà enregistré, remplacement`);
    }
    
    const wrappedHandler = this.wrapHandler(channel, handler, options);
    this.handlers.set(channel, { handler: wrappedHandler, options });
    
    ipcMain.handle(channel, wrappedHandler);
    console.log(`✅ Handler IPC enregistré: ${channel}`);
  }
  
  // Wrapper pour les handlers avec gestion d'erreurs et métriques
  wrapHandler(channel, handler, options) {
    return async (event, ...args) => {
      const startTime = Date.now();
      this.stats.callsTotal++;
      
      try {
        // Exécuter les middlewares
        for (const middleware of this.middlewares) {
          const result = await middleware(channel, event, args);
          if (result === false) {
            throw new Error('Requête bloquée par middleware');
          }
        }
        
        // Validation des arguments si spécifiée
        if (options.validate) {
          const validation = options.validate(args);
          if (!validation.valid) {
            throw new Error(`Arguments invalides: ${validation.error}`);
          }
        }
        
        // Exécuter le handler
        const result = await handler(event, ...args);
        
        // Métriques de succès
        this.stats.callsSuccess++;
        this.updateResponseTime(Date.now() - startTime);
        
        return result;
        
      } catch (error) {
        this.stats.callsError++;
        
        const errorInfo = errorHandler.handleError(
          `IPC-${channel}`,
          error,
          { channel, args: args.slice(0, 2) } // Limiter les args dans les logs
        );
        
        // Retourner une erreur structurée
        return {
          success: false,
          error: error.message,
          code: error.code || 'UNKNOWN_ERROR',
          timestamp: Date.now()
        };
      }
    };
  }
  
  // Mettre à jour le temps de réponse moyen
  updateResponseTime(responseTime) {
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (this.stats.callsSuccess - 1) + responseTime) / 
      this.stats.callsSuccess;
  }
  
  // Middleware de validation des IP pour la sécurité
  createIPValidationMiddleware(allowedIPs = []) {
    return async (channel, event, args) => {
      if (channel.includes('connect') || channel.includes('network')) {
        const senderIP = event.sender.getURL();
        // Validation basique - à améliorer selon les besoins
        return true;
      }
      return true;
    };
  }
  
  // Middleware de rate limiting
  createRateLimitMiddleware(maxCalls = 100, windowMs = 60000) {
    const calls = new Map();
    
    return async (channel, event, args) => {
      const senderId = event.sender.id;
      const now = Date.now();
      
      if (!calls.has(senderId)) {
        calls.set(senderId, []);
      }
      
      const senderCalls = calls.get(senderId);
      
      // Nettoyer les anciens appels
      const recentCalls = senderCalls.filter(time => now - time < windowMs);
      calls.set(senderId, recentCalls);
      
      if (recentCalls.length >= maxCalls) {
        throw new Error('Rate limit dépassé');
      }
      
      recentCalls.push(now);
      return true;
    };
  }
  
  // Vérifier si un handler existe
  hasHandler(channel) {
    return this.handlers.has(channel);
  }
  
  // Lister tous les handlers
  listHandlers() {
    return Array.from(this.handlers.keys());
  }
  
  // Obtenir les statistiques
  getStats() {
    return {
      ...this.stats,
      handlers: this.handlers.size,
      successRate: this.stats.callsTotal > 0 ? 
        (this.stats.callsSuccess / this.stats.callsTotal * 100).toFixed(2) + '%' : '0%'
    };
  }
  
  // Valider la configuration d'un handler
  validateHandlerConfig(channel, expectedArgs = []) {
    return {
      validate: (args) => {
        if (args.length < expectedArgs.length) {
          return {
            valid: false,
            error: `Attendu ${expectedArgs.length} arguments, reçu ${args.length}`
          };
        }
        
        for (let i = 0; i < expectedArgs.length; i++) {
          const expected = expectedArgs[i];
          const actual = args[i];
          
          if (expected.required && (actual === undefined || actual === null)) {
            return {
              valid: false,
              error: `Argument ${i} (${expected.name}) requis manquant`
            };
          }
          
          if (expected.type && typeof actual !== expected.type) {
            return {
              valid: false,
              error: `Argument ${i} (${expected.name}) doit être de type ${expected.type}`
            };
          }
        }
        
        return { valid: true };
      }
    };
  }
  
  // Nettoyer les handlers (pour les tests)
  cleanup() {
    this.handlers.clear();
    ipcMain.removeAllListeners();
  }
}

// Instance singleton
const ipcManager = new IPCManager();

module.exports = IPCManager;
module.exports.instance = ipcManager; 