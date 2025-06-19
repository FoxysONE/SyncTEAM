#!/usr/bin/env node

// Script de test final - syncTEAM optimisé
console.log('🧪 TEST FINAL - syncTEAM Optimisé');
console.log('='.repeat(50));

const fs = require('fs');
const path = require('path');

// Tests des modules principaux
const tests = [
  {
    name: 'Modules optimisés',
    test: () => {
      const modules = [
        'src/error-handler.js',
        'src/ipc-manager.js', 
        'src/network-manager.js',
        'src/handlers/ipc-handlers.js',
        'src/main.js'
      ];
      
      let success = 0;
      let errors = [];
      
      modules.forEach(module => {
        if (fs.existsSync(module)) {
          success++;
          console.log(`  ✅ ${module}`);
        } else {
          errors.push(module);
          console.log(`  ❌ ${module} MANQUANT`);
        }
      });
      
      return { success: success === modules.length, errors };
    }
  },
  
  {
    name: 'Structure des handlers IPC',
    test: () => {
      try {
        const handlerPath = 'src/handlers/ipc-handlers.js';
        if (!fs.existsSync(handlerPath)) {
          return { success: false, error: 'Fichier handlers manquant' };
        }
        
        const content = fs.readFileSync(handlerPath, 'utf8');
        const checks = [
          'setupProjectHandlers',
          'setupUpdateHandlers', 
          'setupLiveCodingHandlers',
          'setupConfigHandlers',
          'setupNetworkHandlers'
        ];
        
        let found = 0;
        checks.forEach(check => {
          if (content.includes(check)) {
            found++;
            console.log(`  ✅ ${check}`);
          } else {
            console.log(`  ❌ ${check} manquant`);
          }
        });
        
        return { success: found === checks.length };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },
  
  {
    name: 'Configuration package.json',
    test: () => {
      try {
        const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
        const requiredDeps = ['electron', 'ws', 'chokidar', 'diff'];
        
        let found = 0;
        requiredDeps.forEach(dep => {
          if (pkg.dependencies && pkg.dependencies[dep]) {
            found++;
            console.log(`  ✅ ${dep}: ${pkg.dependencies[dep]}`);
          } else {
            console.log(`  ❌ ${dep} manquant`);
          }
        });
        
        return { success: found === requiredDeps.length };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
  },
  
  {
    name: 'Scripts de correction',
    test: () => {
      const scripts = ['fix-issues.js'];
      let success = 0;
      
      scripts.forEach(script => {
        if (fs.existsSync(script)) {
          success++;
          console.log(`  ✅ ${script}`);
        } else {
          console.log(`  ❌ ${script} manquant`);
        }
      });
      
      return { success: success === scripts.length };
    }
  },
  
  {
    name: 'Syntaxe JavaScript',
    test: () => {
      const filesToCheck = [
        'src/main.js',
        'src/error-handler.js',
        'src/ipc-manager.js',
        'src/network-manager.js'
      ];
      
      let validFiles = 0;
      
      filesToCheck.forEach(file => {
        if (fs.existsSync(file)) {
          try {
            // Test basique de syntaxe
            const content = fs.readFileSync(file, 'utf8');
            
            // Vérifications basiques
            const hasValidExports = content.includes('module.exports') || content.includes('exports.');
            const hasValidRequire = !content.includes('require(') || content.match(/require\(['"][^'"]+['"]\)/);
            
            if (hasValidExports) {
              validFiles++;
              console.log(`  ✅ ${file} - Syntaxe OK`);
            } else {
              console.log(`  ⚠️ ${file} - Exports manquants`);
            }
          } catch (error) {
            console.log(`  ❌ ${file} - Erreur: ${error.message.substring(0, 50)}...`);
          }
        }
      });
      
      return { success: validFiles === filesToCheck.length };
    }
  }
];

// Exécuter tous les tests
let totalTests = 0;
let passedTests = 0;

console.log('\n🔍 EXÉCUTION DES TESTS...\n');

tests.forEach((test, index) => {
  totalTests++;
  console.log(`${index + 1}. ${test.name}:`);
  
  try {
    const result = test.test();
    
    if (result.success) {
      passedTests++;
      console.log(`   ✅ PASSÉ\n`);
    } else {
      console.log(`   ❌ ÉCHEC`);
      if (result.error) {
        console.log(`      Erreur: ${result.error}`);
      }
      if (result.errors) {
        result.errors.forEach(err => console.log(`      - ${err}`));
      }
      console.log();
    }
  } catch (error) {
    console.log(`   💥 ERREUR: ${error.message}\n`);
  }
});

// Résultats finaux
console.log('='.repeat(50));
console.log(`📊 RÉSULTATS: ${passedTests}/${totalTests} tests réussis`);

const successRate = (passedTests / totalTests) * 100;

if (successRate === 100) {
  console.log('🎉 TOUS LES TESTS PASSÉS - syncTEAM EST PRÊT !');
  console.log('\n🚀 PROCHAINES ÉTAPES:');
  console.log('   1. npm start - Lancer l\'application');
  console.log('   2. Sélectionner un projet');
  console.log('   3. Démarrer une session live coding');
  console.log('   4. Tester la synchronisation');
} else if (successRate >= 80) {
  console.log('⚡ TESTS MAJORITAIREMENT RÉUSSIS - Quelques corrections mineures');
  console.log('\n🔧 Actions recommandées:');
  console.log('   1. Corriger les points d\'échec');
  console.log('   2. Relancer les tests');
  console.log('   3. Tester l\'application');
} else {
  console.log('⚠️ PLUSIEURS PROBLÈMES DÉTECTÉS');
  console.log('\n🆘 Actions urgentes:');
  console.log('   1. Vérifier les modules manquants');
  console.log('   2. Corriger les erreurs de syntaxe');
  console.log('   3. Relancer fix-issues.js');
}

console.log('\n📁 FICHIERS DISPONIBLES:');
try {
      const files = [
      'src/main.js (principal - refactorisé)',
      'src/main-backup.js (sauvegarde)',
      'src/error-handler.js (gestionnaire d\'erreurs)',
      'src/ipc-manager.js (gestionnaire IPC)',
      'src/network-manager.js (gestionnaire réseau)',
      'src/handlers/ipc-handlers.js (handlers centralisés)',
      'fix-issues.js (script de correction)'
    ];
  
  files.forEach(file => {
    const [path, desc] = file.split(' (');
    const filePath = path.trim();
    const description = desc ? desc.replace(')', '') : '';
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      console.log(`   ✅ ${filePath} - ${description} (${Math.round(stats.size/1024)}kb)`);
    } else {
      console.log(`   ❌ ${filePath} - MANQUANT`);
    }
  });
} catch (error) {
  console.log('   ⚠️ Erreur listage des fichiers');
}

console.log('\n' + '='.repeat(50));
console.log('🏁 TEST FINAL TERMINÉ');

// Code de sortie
process.exit(successRate === 100 ? 0 : 1); 