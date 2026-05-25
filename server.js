const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/api/dados', (req, res) => {
    const { comentario, operador, timestamp, arquivos } = req.body;

    // cria pasta com timestamp do envio
    const pasta = path.join('./uploads', timestamp.replace(/:/g, '-'));
    fs.mkdirSync(pasta, { recursive: true });

    // salva cada arquivo CSV
    Object.entries(arquivos).forEach(([nome, base64]) => {
        const conteudo = Buffer.from(base64, 'base64');
        fs.writeFileSync(path.join(pasta, `${nome}.csv`), conteudo);
    });

    // salva o comentário em txt
    fs.writeFileSync(path.join(pasta, 'comentario.txt'), 
        `Operador: ${operador}\nTimestamp: ${timestamp}\nComentário: ${comentario}`
    );

    console.log('Recebido de:', operador);
    console.log('Salvo em:', pasta);

    res.status(200).json({ status: 'recebido' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));