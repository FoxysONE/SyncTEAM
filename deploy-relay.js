#!/usr/bin/env node

// Script de déploiement automatique du serveur de relais
// Utilise Railway ou Render pour le déploiement gratuit

const fs = require('fs');
const path = require('path');

console.log('🚀 Configuration du serveur de relais...');

// Créer package.json pour le serveur de relais
const relayPackage = {
  "name": "codesync-relay",
  "version": "1.0.0",
  "description": "Serveur de relais pour CodeSync",
  "main": "src/relay-server.js",
  "scripts": {
    "start": "node src/relay-server.js",
    "dev": "node src/relay-server.js"
  },
  "dependencies": {
    "ws": "^8.13.0"
  },
  "engines": {
    "node": ">=16.0.0"
  }
};

// Créer le dossier relay s'il n'existe pas
if (!fs.existsSync('relay')) {
  fs.mkdirSync('relay');
}

// Écrire le package.json dans le dossier relay
fs.writeFileSync('relay/package.json', JSON.stringify(relayPackage, null, 2));

// Copier le serveur de relais
fs.copyFileSync('src/relay-server.js', 'relay/server.js');

// Créer un Dockerfile simple
const dockerfile = `FROM node:16-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY server.js ./

EXPOSE 3000

CMD ["npm", "start"]
`;

fs.writeFileSync('relay/Dockerfile', dockerfile);

// Créer un fichier Railway ou Render
const railwayConfig = {
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
};

fs.writeFileSync('relay/railway.json', JSON.stringify(railwayConfig, null, 2));

console.log('✅ Configuration terminée !');
console.log('');
console.log('📋 Instructions de déploiement :');
console.log('1. Créer un compte sur Railway.app ou Render.com');
console.log('2. Connecter votre repository GitHub');
console.log('3. Déployer le dossier "relay"');
console.log('4. Copier l\'URL fournie');
console.log('5. Remplacer "wss://relay-codesync.herokuapp.com" dans main.js par votre URL');
console.log('');
console.log('🎯 Avantages du serveur de relais :');
console.log('- ✅ Pas d\'ouverture de ports');
console.log('- ✅ Fonctionne derrière NAT/firewall');
console.log('- ✅ Accessible depuis n\'importe où');
console.log('- ✅ Gratuit avec Railway/Render');
console.log('');
console.log('🔄 Votre application utilisera maintenant :');
console.log('- Sessions partagées via ID au lieu d\'IP:PORT');
console.log('- Connexions chiffrées via WebSocket Secure (WSS)');
console.log('- Serveur de relais pour router les données'); 