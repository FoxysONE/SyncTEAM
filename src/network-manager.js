// Gestionnaire réseau unifié
const os = require('os');
const { instance: errorHandler } = require('./error-handler');

class NetworkManager {
  constructor(configManager) {
    this.configManager = configManager;
    this.networkInterfaces = new Map();
    this.currentMode = 'local';
    this.serverInstances = new Map();
    
    this.refreshNetworkInterfaces();
    
    // Rafraîchir les interfaces réseau toutes les 30 secondes
    setInterval(() => {
      this.refreshNetworkInterfaces();
    }, 30000);
  }
  
  // Rafraîchir les interfaces réseau
  refreshNetworkInterfaces() {
    try {
      const interfaces = os.networkInterfaces();
      this.networkInterfaces.clear();
      
      Object.keys(interfaces).forEach(interfaceName => {
        interfaces[interfaceName].forEach(iface => {
          if (iface.family === 'IPv4' && !iface.internal) {
            this.networkInterfaces.set(interfaceName, {
              address: iface.address,
              netmask: iface.netmask,
              mac: iface.mac,
              status: 'active'
            });
          }
        });
      });
      
      console.log(`🌐 Interfaces réseau détectées: ${this.networkInterfaces.size}`);
      
    } catch (error) {
      errorHandler.handleError('NetworkManager', error);
    }
  }
  
  // Obtenir la meilleure interface réseau
  getBestNetworkInterface() {
    if (this.networkInterfaces.size === 0) {
      return null;
    }
    
    // Préférer les interfaces Ethernet aux WiFi
    const interfaces = Array.from(this.networkInterfaces.entries());
    
    // Priorité: ethernet > wifi > autres
    const priorities = [
      ['ethernet', 'eth'],
      ['wi-fi', 'wlan', 'wifi'],
      ['vmware', 'virtualbox', 'hyper-v']
    ];
    
    for (const priorityGroup of priorities) {
      for (const [name, info] of interfaces) {
        if (priorityGroup.some(pattern => 
          name.toLowerCase().includes(pattern.toLowerCase())
        )) {
          return { name, ...info };
        }
      }
    }
    
    // Retourner la première interface si aucune priorité
    return { name: interfaces[0][0], ...interfaces[0][1] };
  }
  
  // Déterminer le mode réseau optimal
  determineOptimalMode() {
    const networkConfig = this.configManager.get('networkMode');
    
    if (networkConfig === 'auto') {
      const hasNetworkInterface = this.networkInterfaces.size > 0;
      const isOnNetwork = this.detectNetworkEnvironment();
      
      if (hasNetworkInterface && isOnNetwork) {
        return 'network';
      } else {
        return 'local';
      }
    }
    
    return networkConfig || 'local';
  }
  
  // Détecter l'environnement réseau
  detectNetworkEnvironment() {
    try {
      const bestInterface = this.getBestNetworkInterface();
      if (!bestInterface) return false;
      
      // Vérifier si on est sur un réseau privé
      const ip = bestInterface.address;
      const isPrivate = 
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('172.');
        
      return isPrivate;
    } catch (error) {
      errorHandler.handleWarning('NetworkManager', 'Impossible de détecter l\'environnement réseau');
      return false;
    }
  }
  
  // Obtenir la configuration réseau pour un serveur
  getServerConfig(port = 8080, forceMode = null) {
    const mode = forceMode || this.determineOptimalMode();
    this.currentMode = mode;
    
    let host, externalAccess;
    
    switch (mode) {
      case 'network':
        host = '0.0.0.0';
        externalAccess = true;
        break;
        
      case 'local':
      default:
        host = 'localhost';
        externalAccess = false;
        break;
    }
    
    const config = {
      host,
      port,
      mode,
      externalAccess,
      interfaces: this.getAccessibleAddresses(port)
    };
    
    console.log(`🌐 Configuration serveur [${mode}]:`, config);
    return config;
  }
  
  // Obtenir toutes les adresses accessibles
  getAccessibleAddresses(port) {
    const addresses = [];
    
    // Toujours ajouter localhost
    addresses.push({
      name: 'Local',
      address: `localhost:${port}`,
      description: 'Accès local uniquement',
      type: 'local'
    });
    
    if (this.currentMode === 'network') {
      // Ajouter les interfaces réseau
      this.networkInterfaces.forEach((info, name) => {
        addresses.push({
          name: name,
          address: `${info.address}:${port}`,
          description: `Accès réseau via ${name}`,
          type: 'network'
        });
      });
    }
    
    return addresses;
  }
  
  // Basculer le mode réseau
  async switchMode(newMode) {
    if (!['local', 'network', 'auto'].includes(newMode)) {
      throw new Error(`Mode réseau invalide: ${newMode}`);
    }
    
    const oldMode = this.currentMode;
    
    try {
      // Mettre à jour la configuration
      await this.configManager.set('networkMode', newMode);
      
      // Redémarrer les serveurs si nécessaire
      await this.restartServers(newMode);
      
      this.currentMode = newMode;
      
      console.log(`🔄 Mode réseau changé: ${oldMode} → ${newMode}`);
      
      return {
        success: true,
        oldMode,
        newMode,
        config: this.getServerConfig()
      };
      
    } catch (error) {
      errorHandler.handleError('NetworkManager', error);
      throw error;
    }
  }
  
  // Redémarrer les serveurs avec la nouvelle configuration
  async restartServers(mode) {
    const promises = [];
    
    for (const [name, server] of this.serverInstances.entries()) {
      if (server && server.restart) {
        promises.push(
          server.restart(this.getServerConfig(server.port, mode))
        );
      }
    }
    
    await Promise.all(promises);
  }
  
  // Enregistrer une instance de serveur
  registerServer(name, serverInstance) {
    this.serverInstances.set(name, serverInstance);
  }
  
  // Désenregistrer une instance de serveur
  unregisterServer(name) {
    this.serverInstances.delete(name);
  }
  
  // Tester la connectivité réseau
  async testConnectivity(targetIP, port = 8080) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve({
          success: false,
          error: 'Timeout',
          latency: null
        });
      }, 5000);
      
      const startTime = Date.now();
      
      socket.connect(port, targetIP, () => {
        const latency = Date.now() - startTime;
        clearTimeout(timeout);
        socket.destroy();
        
        resolve({
          success: true,
          latency,
          target: `${targetIP}:${port}`
        });
      });
      
      socket.on('error', (error) => {
        clearTimeout(timeout);
        socket.destroy();
        
        resolve({
          success: false,
          error: error.message,
          latency: null
        });
      });
    });
  }
  
  // Obtenir les statistiques réseau
  getNetworkStats() {
    return {
      currentMode: this.currentMode,
      interfacesCount: this.networkInterfaces.size,
      interfaces: Array.from(this.networkInterfaces.entries()).map(([name, info]) => ({
        name,
        address: info.address,
        status: info.status
      })),
      servers: Array.from(this.serverInstances.keys()),
      bestInterface: this.getBestNetworkInterface()
    };
  }
  
  // Obtenir l'adresse IP publique (via service externe)
  async getPublicIP() {
    try {
      const https = require('https');
      
      return new Promise((resolve, reject) => {
        const request = https.get('https://api.ipify.org', (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => resolve(data.trim()));
        });
        
        request.on('error', reject);
        request.setTimeout(5000, () => {
          request.destroy();
          reject(new Error('Timeout'));
        });
      });
      
    } catch (error) {
      errorHandler.handleWarning('NetworkManager', 'Impossible d\'obtenir l\'IP publique');
      return null;
    }
  }
}

module.exports = NetworkManager; 