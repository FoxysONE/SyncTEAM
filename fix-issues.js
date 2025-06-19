#!/usr/bin/env node

// Script de correction automatique des problèmes syncTEAM
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 CORRECTION AUTOMATIQUE DES PROBLÈMES syncTEAM');
console.log('='.repeat(60));

const issues = [];
const fixes = [];

// Vérifier les dépendances manquantes
function checkDependencies() {
  console.log('\n📦 Vérification des dépendances...');
  
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const dependencies = packageJson.dependencies || {};
    
    const requiredDeps = {
      'diff': '^5.1.0',
      'ws': '^8.13.0',
      'chokidar': '^3.5.3',
      'uuid': '^9.0.0',
      'lodash': '^4.17.21'
    };
    
    const missingDeps = [];
    
    Object.entries(requiredDeps).forEach(([dep, version]) => {
      if (!dependencies[dep]) {
        missingDeps.push(`${dep}@${version}`);
      }
    });
    
    if (missingDeps.length > 0) {
      issues.push(`Dépendances manquantes: ${missingDeps.join(', ')}`);
      fixes.push(() => {
        console.log('📥 Installation des dépendances manquantes...');
        execSync(`npm install ${missingDeps.join(' ')}`, { stdio: 'inherit' });
      });
    } else {
      console.log('✅ Toutes les dépendances requises sont présentes');
    }
    
  } catch (error) {
    issues.push('Impossible de lire package.json');
  }
}

// Vérifier les fichiers de configuration
function checkConfigFiles() {
  console.log('\n⚙️ Vérification des fichiers de configuration...');
  
  const configDir = path.join(require('os').homedir(), '.syncteam');
  const configFile = path.join(configDir, 'config.json');
  
  if (!fs.existsSync(configDir)) {
    issues.push('Dossier de configuration manquant');
    fixes.push(() => {
      console.log('📁 Création du dossier de configuration...');
      fs.mkdirSync(configDir, { recursive: true });
    });
  }
  
  if (!fs.existsSync(configFile)) {
    issues.push('Fichier de configuration manquant');
    fixes.push(() => {
      console.log('📄 Création de la configuration par défaut...');
      const defaultConfig = {
        networkMode: 'auto',
        server: {
          enabled: true,
          port: 8080,
          host: 'localhost',
          autoStart: true,
          maxClients: 10
        },
        files: {
          maxDepth: 10,
          debounceTime: 300,
          watcherEnabled: true
        }
      };
      fs.writeFileSync(configFile, JSON.stringify(defaultConfig, null, 2));
    });
  }
}

// Vérifier la structure des fichiers
function checkFileStructure() {
  console.log('\n📁 Vérification de la structure des fichiers...');
  
  const requiredFiles = [
    'src/main.js',
    'src/config.js',
    'src/renderer/index.html',
    'src/renderer/renderer.js',
    'package.json'
  ];
  
  const missingFiles = requiredFiles.filter(file => !fs.existsSync(file));
  
  if (missingFiles.length > 0) {
    issues.push(`Fichiers manquants: ${missingFiles.join(', ')}`);
  } else {
    console.log('✅ Structure des fichiers correcte');
  }
}

// Vérifier les handlers IPC
function checkIPCHandlers() {
  console.log('\n🔗 Vérification des handlers IPC...');
  
  try {
    const mainJs = fs.readFileSync('src/main.js', 'utf8');
    const rendererJs = fs.readFileSync('src/renderer/renderer.js', 'utf8');
    
    // Extraire les handlers définis
    const handlerMatches = mainJs.match(/ipcMain\.handle\(['"`]([^'"`]+)['"`]/g) || [];
    const definedHandlers = handlerMatches.map(match => 
      match.match(/['"`]([^'"`]+)['"`]/)[1]
    );
    
    // Extraire les handlers utilisés
    const invokeMatches = rendererJs.match(/ipcRenderer\.invoke\(['"`]([^'"`]+)['"`]/g) || [];
    const usedHandlers = invokeMatches.map(match => 
      match.match(/['"`]([^'"`]+)['"`]/)[1]
    );
    
    const missingHandlers = usedHandlers.filter(handler => 
      !definedHandlers.includes(handler)
    );
    
    if (missingHandlers.length > 0) {
      issues.push(`Handlers IPC manquants: ${missingHandlers.join(', ')}`);
    } else {
      console.log('✅ Tous les handlers IPC sont définis');
    }
    
    console.log(`📊 Handlers définis: ${definedHandlers.length}`);
    console.log(`📊 Handlers utilisés: ${usedHandlers.length}`);
    
  } catch (error) {
    issues.push('Impossible de vérifier les handlers IPC');
  }
}

// Vérifier les permissions
function checkPermissions() {
  console.log('\n🔐 Vérification des permissions...');
  
  try {
    // Tester l'écriture dans le dossier courant
    const testFile = path.join('.', 'test-write.tmp');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log('✅ Permissions d\'écriture OK');
    
  } catch (error) {
    issues.push('Permissions d\'écriture insuffisantes');
  }
}

// Vérifier les ports disponibles
async function checkPorts() {
  console.log('\n🌐 Vérification des ports réseau...');
  
  const net = require('net');
  const portsToCheck = [8080, 8081, 8082];
  
  for (const port of portsToCheck) {
    try {
      await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(port, () => {
          server.close(resolve);
        });
        server.on('error', reject);
      });
      
      console.log(`✅ Port ${port} disponible`);
      
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        issues.push(`Port ${port} occupé`);
      }
    }
  }
}

// Corriger les problèmes de code
function fixCodeIssues() {
  console.log('\n🛠️ Correction des problèmes de code...');
  
  // Intégrer les nouveaux modules dans main.js
  const mainJsPath = 'src/main.js';
  if (fs.existsSync(mainJsPath)) {
    let mainJs = fs.readFileSync(mainJsPath, 'utf8');
    
    // Ajouter les imports des nouveaux modules si pas présents
    const imports = [
      "const { instance: errorHandler } = require('./error-handler');",
      "const { instance: ipcManager } = require('./ipc-manager');",
      "const NetworkManager = require('./network-manager');"
    ];
    
    let modified = false;
    imports.forEach(importLine => {
      if (!mainJs.includes(importLine)) {
        // Ajouter après les autres imports
        const insertPoint = mainJs.indexOf('class CodeSyncApp');
        if (insertPoint > 0) {
          mainJs = mainJs.substring(0, insertPoint) + importLine + '\n\n' + mainJs.substring(insertPoint);
          modified = true;
        }
      }
    });
    
    if (modified) {
      fixes.push(() => {
        console.log('🔧 Mise à jour de main.js avec les nouveaux modules...');
        fs.writeFileSync(mainJsPath, mainJs);
      });
    }
  }
}

// Créer un rapport de santé
function generateHealthReport() {
  const report = {
    timestamp: new Date().toISOString(),
    issues: issues,
    fixes: fixes.length,
    status: issues.length === 0 ? 'HEALTHY' : 'NEEDS_ATTENTION',
    recommendations: []
  };
  
  if (issues.length > 0) {
    report.recommendations = [
      'Exécuter les corrections automatiques',
      'Redémarrer l\'application après les corrections',
      'Vérifier les logs pour d\'éventuelles erreurs restantes'
    ];
  }
  
  fs.writeFileSync('health-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Rapport de santé généré: health-report.json');
  
  return report;
}

// Fonction principale
async function main() {
  try {
    console.log('🔍 Analyse des problèmes...\n');
    
    checkDependencies();
    checkConfigFiles();
    checkFileStructure();
    checkIPCHandlers();
    checkPermissions();
    await checkPorts();
    fixCodeIssues();
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 RÉSULTATS: ${issues.length} problème(s) détecté(s)`);
    
    if (issues.length > 0) {
      console.log('\n❌ PROBLÈMES DÉTECTÉS:');
      issues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
      });
    }
    
    if (fixes.length > 0) {
      console.log(`\n🔧 ${fixes.length} correction(s) disponible(s)`);
      
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      const answer = await new Promise(resolve => {
        rl.question('\n❓ Appliquer les corrections automatiquement? (y/N) ', resolve);
      });
      
      rl.close();
      
      if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
        console.log('\n🚀 Application des corrections...');
        
        for (let i = 0; i < fixes.length; i++) {
          try {
            await fixes[i]();
            console.log(`✅ Correction ${i + 1}/${fixes.length} appliquée`);
          } catch (error) {
            console.error(`❌ Erreur correction ${i + 1}:`, error.message);
          }
        }
        
        console.log('\n✅ Corrections terminées!');
        console.log('🔄 Redémarrez syncTEAM pour appliquer les changements');
      }
    }
    
    const report = generateHealthReport();
    
    if (report.status === 'HEALTHY') {
      console.log('\n🎉 syncTEAM est en bonne santé!');
    } else {
      console.log('\n⚠️ syncTEAM nécessite des corrections');
    }
    
  } catch (error) {
    console.error('\n💥 Erreur lors de l\'analyse:', error);
    process.exit(1);
  }
}

// Exécuter le script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, checkDependencies, checkConfigFiles }; 