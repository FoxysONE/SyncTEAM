// Système de configuration centralisé
const fs = require('fs');
const path = require('path');
const os = require('os');

class ConfigManager {
  constructor() {
    this.configPath = path.join(os.homedir(), '.syncteam', 'config.json');
    this.defaultConfig = {
      // Mode de fonctionnement
      networkMode: 'local', // 'local' | 'network' | 'auto'
      
      // Serveur live coding
      server: {
        enabled: true,
        port: 8080,
        host: 'localhost', // 'localhost' pour local seulement, '0.0.0.0' pour réseau
        autoStart: true,
        maxClients: 10,
        heartbeatInterval: 30000,
        sessionTimeout: 86400000 // 24h
      },
      files: {
        maxDepth: 10,
        debounceTime: 300,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        watcherEnabled: true,
        ignorePatterns: [
          'node_modules/**',
          '.git/**',
          '*.log',
          '*.tmp',
          'dist/**',
          'build/**'
        ]
      },
      ui: {
        theme: 'dark',
        language: 'fr',
        notifications: true,
        autoUpdate: true
      },
      security: {
        requirePassword: false,
        allowedIPs: [], // Vide = toutes les IPs
        maxFailedAttempts: 3
      },
      performance: {
        compressionEnabled: true,
        deltaSync: true,
        statsEnabled: true
      }
    };
    
    this.config = this.load();
  }

  // Charger la configuration
  load() {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const config = JSON.parse(data);
        
        // Fusionner avec la config par défaut pour les nouvelles propriétés
        return this.mergeConfig(this.defaultConfig, config);
      }
    } catch (error) {
      console.warn('Erreur chargement config, utilisation des valeurs par défaut:', error.message);
    }
    
    return { ...this.defaultConfig };
  }

  // Sauvegarder la configuration
  save() {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
      return true;
    } catch (error) {
      console.error('Erreur sauvegarde config:', error);
      return false;
    }
  }

  // Obtenir une valeur de configuration
  get(key) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  // Définir une valeur de configuration
  set(key, value) {
    const keys = key.split('.');
    let current = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k];
    }
    
    current[keys[keys.length - 1]] = value;
    return this.save();
  }

  // Valider la configuration
  validate() {
    const errors = [];
    
    // Validation du port
    const port = this.get('server.port');
    if (!Number.isInteger(port) || port < 1024 || port > 65535) {
      errors.push('Port serveur invalide (1024-65535)');
    }
    
    // Validation des clients max
    const maxClients = this.get('server.maxClients');
    if (!Number.isInteger(maxClients) || maxClients < 1 || maxClients > 100) {
      errors.push('Nombre max de clients invalide (1-100)');
    }
    
    // Validation de la taille max des fichiers
    const maxSize = this.get('files.maxFileSize');
    if (!Number.isInteger(maxSize) || maxSize < 1024) {
      errors.push('Taille max fichier invalide (min 1KB)');
    }
    
    return errors;
  }

  // Fusionner deux configurations
  mergeConfig(defaultConfig, userConfig) {
    const result = { ...defaultConfig };
    
    for (const key in userConfig) {
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key])) {
        result[key] = this.mergeConfig(defaultConfig[key] || {}, userConfig[key]);
      } else {
        result[key] = userConfig[key];
      }
    }
    
    return result;
  }

  // Réinitialiser la configuration
  reset() {
    this.config = { ...this.defaultConfig };
    return this.save();
  }

  // Exporter la configuration
  export() {
    return JSON.stringify(this.config, null, 2);
  }

  // Importer une configuration
  import(configString) {
    try {
      const newConfig = JSON.parse(configString);
      this.config = this.mergeConfig(this.defaultConfig, newConfig);
      return this.save();
    } catch (error) {
      console.error('Erreur import config:', error);
      return false;
    }
  }

  // Obtenir toute la configuration
  getConfig() {
    return { ...this.config };
  }

  // Mettre à jour la configuration
  async updateConfig(updates) {
    try {
      // Fusionner les mises à jour
      this.config = this.mergeConfig(this.config, updates);
      
      // Sauvegarder
      const saved = this.save();
      
      if (saved) {
        console.log('✅ Configuration mise à jour:', updates);
        return { success: true };
      } else {
        throw new Error('Erreur sauvegarde');
      }
    } catch (error) {
      console.error('❌ Erreur mise à jour config:', error);
      return { success: false, error: error.message };
    }
  }

  // Configuration par défaut
  getDefaultConfig() {
    return {
      // Mode de fonctionnement
      networkMode: 'local', // 'local' | 'network' | 'auto'
      
      // Serveur live coding
      server: {
        enabled: true,
        port: 8080,
        host: 'localhost', // 'localhost' pour local seulement, '0.0.0.0' pour réseau
        autoStart: true
      },
      files: {
        maxDepth: 10,
        debounceTime: 300,
        maxFileSize: 10 * 1024 * 1024, // 10MB
        watcherEnabled: true,
        ignorePatterns: [
          'node_modules/**',
          '.git/**',
          '*.log',
          '*.tmp',
          'dist/**',
          'build/**'
        ]
      },
      ui: {
        theme: 'dark',
        language: 'fr',
        notifications: true,
        autoUpdate: true
      },
      security: {
        requirePassword: false,
        allowedIPs: [], // Vide = toutes les IPs
        maxFailedAttempts: 3
      },
      performance: {
        compressionEnabled: true,
        deltaSync: true,
        statsEnabled: true
      }
    };
  }
}

module.exports = ConfigManager; 