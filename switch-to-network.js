const fs = require('fs');
const path = require('path');
const os = require('os');

// Chemin du fichier de configuration
const configPath = path.join(os.homedir(), '.syncteam', 'config.json');

console.log('🔄 Basculement vers le mode réseau...');

try {
  // Lire la configuration actuelle
  let config = {};
  if (fs.existsSync(configPath)) {
    const data = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(data);
  }
  
  // Basculer vers le mode réseau
  config.networkMode = 'network';
  
  // Créer le dossier si nécessaire
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  // Sauvegarder
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  
  console.log('✅ Mode réseau activé !');
  console.log('🌐 Le serveur va maintenant écouter sur 0.0.0.0:8080');
  console.log('🔄 Redémarrez syncTEAM pour appliquer les changements');
  console.log('');
  console.log('📡 Votre serveur sera accessible via :');
  
  // Afficher les IPs disponibles
  const networkInterfaces = os.networkInterfaces();
  Object.keys(networkInterfaces).forEach(interfaceName => {
    networkInterfaces[interfaceName].forEach(iface => {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`   🌐 http://${iface.address}:8080`);
      }
    });
  });
  
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
} 