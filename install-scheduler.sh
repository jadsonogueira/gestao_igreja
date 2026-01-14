#!/bin/bash

# Script de Instalação do Scheduler - Igreja App
# Automatiza a configuração do sistema de envios automáticos

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Instalação do Scheduler - Sistema Igreja App           ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar se estamos no diretório correto
if [ ! -f "scheduler.js" ]; then
    echo "❌ Erro: Execute este script no diretório do projeto"
    echo "   cd /home/ubuntu/igreja_gestao_membros/nextjs_space"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado. Por favor, instale Node.js primeiro."
    exit 1
fi

echo "✓ Node.js encontrado: $(node --version)"
echo ""

# Perguntar método de instalação
echo "Escolha o método de instalação do scheduler:"
echo ""
echo "1) PM2 (Recomendado para produção)"
echo "2) Systemd (Linux service)"
echo "3) Manual (Apenas configurar, iniciar depois)"
echo ""
read -p "Opção [1/2/3]: " choice

case $choice in
    1)
        echo ""
        echo "📦 Instalando PM2..."
        
        # Verificar se PM2 já está instalado
        if ! command -v pm2 &> /dev/null; then
            npm install -g pm2
        else
            echo "✓ PM2 já está instalado"
        fi
        
        echo ""
        echo "🚀 Iniciando scheduler com PM2..."
        pm2 start scheduler.js --name "igreja-scheduler"
        
        echo ""
        echo "💾 Salvando configuração PM2..."
        pm2 save
        
        echo ""
        echo "🔄 Configurando PM2 para iniciar no boot..."
        pm2 startup
        
        echo ""
        echo "✅ Scheduler instalado e iniciado com PM2!"
        echo ""
        echo "Comandos úteis:"
        echo "  pm2 list                    - Ver status"
        echo "  pm2 logs igreja-scheduler   - Ver logs"
        echo "  pm2 stop igreja-scheduler   - Parar"
        echo "  pm2 restart igreja-scheduler - Reiniciar"
        echo "  pm2 delete igreja-scheduler  - Remover"
        ;;
        
    2)
        echo ""
        echo "📝 Criando serviço systemd..."
        
        # Obter usuário atual
        CURRENT_USER=$(whoami)
        PROJECT_DIR=$(pwd)
        
        # Criar arquivo de serviço
        SERVICE_FILE="/tmp/igreja-scheduler.service"
        
        cat > $SERVICE_FILE << EOF
[Unit]
Description=Igreja Email Scheduler
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/node $PROJECT_DIR/scheduler.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=APP_URL=https://igreja-gestao-membro-l1ymra.abacusai.app

[Install]
WantedBy=multi-user.target
EOF

        echo "✓ Arquivo de serviço criado em: $SERVICE_FILE"
        echo ""
        echo "Execute os seguintes comandos como root (sudo):"
        echo ""
        echo "  sudo cp $SERVICE_FILE /etc/systemd/system/"
        echo "  sudo systemctl daemon-reload"
        echo "  sudo systemctl enable igreja-scheduler"
        echo "  sudo systemctl start igreja-scheduler"
        echo "  sudo systemctl status igreja-scheduler"
        echo ""
        echo "Logs:"
        echo "  sudo journalctl -u igreja-scheduler -f"
        ;;
        
    3)
        echo ""
        echo "✓ Configuração manual selecionada"
        echo ""
        echo "Para iniciar o scheduler manualmente, execute:"
        echo ""
        echo "  # Desenvolvimento (localhost)"
        echo "  APP_URL=http://localhost:3000 node scheduler.js"
        echo ""
        echo "  # Produção"
        echo "  node scheduler.js"
        echo ""
        echo "Ou use PM2/Systemd conforme documentação em AUTOMACAO_README.md"
        ;;
        
    *)
        echo "❌ Opção inválida"
        exit 1
        ;;
esac

echo ""
echo "════════════════════════════════════════════════════════════"
echo ""
echo "📚 Documentação completa disponível em:"
echo "   - AUTOMACAO_README.md"
echo "   - IMPLEMENTACOES_CONCLUIDAS.md"
echo ""
echo "🌐 Acesse o painel de controle:"
echo "   http://localhost:3000/envios"
echo ""
echo "✅ Instalação concluída!"
echo ""
