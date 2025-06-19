// Composants UI réutilisables
class UIComponents {
  
  // Créer un toast de notification avec auto-dismiss
  static createToast(message, type = 'info', duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${this.getToastIcon(type)}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
      <div class="toast-progress"></div>
    `;
    
    // Ajouter au container de toasts
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    container.appendChild(toast);
    
    // Auto-dismiss
    const progressBar = toast.querySelector('.toast-progress');
    progressBar.style.animationDuration = `${duration}ms`;
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('toast-fade-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
    
    return toast;
  }
  
  // Icônes pour les toasts
  static getToastIcon(type) {
    const icons = {
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'info': 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }
  
  // Créer un modal configurable
  static createModal(title, content, buttons = []) {
    const modal = document.createElement('div');
    modal.className = 'modal modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">×</button>
        </div>
        <div class="modal-body">
          ${content}
        </div>
        <div class="modal-footer">
          ${buttons.map(btn => `
            <button class="btn ${btn.class || ''}" onclick="${btn.action}">${btn.text}</button>
          `).join('')}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Fermer en cliquant sur l'overlay
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    return modal;
  }
  
  // Créer un graphique simple pour les statistiques
  static createChart(containerId, data, type = 'line') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = container.offsetWidth;
    canvas.height = 200;
    container.appendChild(canvas);
    
    const ctx = canvas.getContext('2d');
    
    if (type === 'line') {
      this.drawLineChart(ctx, data, canvas.width, canvas.height);
    } else if (type === 'bar') {
      this.drawBarChart(ctx, data, canvas.width, canvas.height);
    }
  }
  
  // Dessiner un graphique en ligne
  static drawLineChart(ctx, data, width, height) {
    if (!data || data.length === 0) return;
    
    const padding = 40;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    
    // Trouver min/max
    const values = data.map(d => d.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;
    
    // Dessiner les axes
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    
    // Dessiner la ligne
    ctx.strokeStyle = '#007bff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = height - padding - ((point.value - minValue) / range) * chartHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.stroke();
    
    // Dessiner les points
    ctx.fillStyle = '#007bff';
    data.forEach((point, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = height - padding - ((point.value - minValue) / range) * chartHeight;
      
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, 2 * Math.PI);
      ctx.fill();
    });
  }
  
  // Créer un loader animé
  static createLoader(text = 'Chargement...') {
    const loader = document.createElement('div');
    loader.className = 'loader-overlay';
    loader.innerHTML = `
      <div class="loader">
        <div class="loader-spinner"></div>
        <div class="loader-text">${text}</div>
      </div>
    `;
    
    document.body.appendChild(loader);
    return loader;
  }
  
  // Créer une barre de progression
  static createProgressBar(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const progress = document.createElement('div');
    progress.className = 'progress-bar';
    progress.innerHTML = `
      <div class="progress-fill" style="width: 0%"></div>
      <div class="progress-text">${options.text || '0%'}</div>
    `;
    
    container.appendChild(progress);
    
    return {
      update: (percentage, text) => {
        const fill = progress.querySelector('.progress-fill');
        const textEl = progress.querySelector('.progress-text');
        fill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
        textEl.textContent = text || `${Math.round(percentage)}%`;
      },
      remove: () => progress.remove()
    };
  }
  
  // Créer un dropdown menu
  static createDropdown(trigger, items) {
    const dropdown = document.createElement('div');
    dropdown.className = 'dropdown';
    dropdown.innerHTML = `
      <div class="dropdown-menu">
        ${items.map(item => `
          <div class="dropdown-item" onclick="${item.action}">
            ${item.icon ? `<span class="dropdown-icon">${item.icon}</span>` : ''}
            ${item.text}
          </div>
        `).join('')}
      </div>
    `;
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      
      // Fermer les autres dropdowns
      document.querySelectorAll('.dropdown.active').forEach(d => {
        d.classList.remove('active');
      });
      
      dropdown.classList.toggle('active');
    });
    
    // Fermer en cliquant ailleurs
    document.addEventListener('click', () => {
      dropdown.classList.remove('active');
    });
    
    trigger.parentElement.appendChild(dropdown);
    return dropdown;
  }
}

// Styles CSS pour les composants
const componentStyles = `
<style>
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  min-width: 300px;
  overflow: hidden;
  position: relative;
  transform: translateX(100%);
  animation: slideIn 0.3s ease forwards;
}

.toast-success { border-left: 4px solid #28a745; }
.toast-error { border-left: 4px solid #dc3545; }
.toast-warning { border-left: 4px solid #ffc107; }
.toast-info { border-left: 4px solid #17a2b8; }

.toast-content {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.toast-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  margin-left: auto;
  opacity: 0.5;
}

.toast-progress {
  height: 3px;
  background: #007bff;
  animation: progressBar linear forwards;
}

.loader-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loader {
  background: white;
  padding: 30px;
  border-radius: 12px;
  text-align: center;
}

.loader-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 15px;
}

@keyframes slideIn {
  to { transform: translateX(0); }
}

@keyframes progressBar {
  from { width: 100%; }
  to { width: 0%; }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
`;

// Injecter les styles
document.head.insertAdjacentHTML('beforeend', componentStyles);

// Export pour utilisation
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UIComponents;
} 