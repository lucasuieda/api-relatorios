const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.query(`
    CREATE TABLE IF NOT EXISTS envios (
        id SERIAL PRIMARY KEY,
        operador VARCHAR(100),
        comentario TEXT,
        timestamp TIMESTAMPTZ,
        alerta TEXT,
        recorte_acoes TEXT,
        recorte_historico TEXT,
        criado_em TIMESTAMPTZ DEFAULT NOW()
    )
`).then(() => console.log('Tabela pronta'));

app.post('/api/dados', async (req, res) => {
    const { comentario, operador, timestamp, arquivos } = req.body;

    await pool.query(
        `INSERT INTO envios (operador, comentario, timestamp, alerta, recorte_acoes, recorte_historico)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [operador, comentario, timestamp, arquivos.alerta, arquivos.recorte_acoes, arquivos.recorte_historico]
    );

    console.log('Recebido de:', operador);
    res.status(200).json({ status: 'recebido' });
});

app.get('/api/envios', async (req, res) => {
    const result = await pool.query(
        'SELECT id, operador, comentario, timestamp, criado_em FROM envios ORDER BY criado_em DESC'
    );
    res.json(result.rows);
});

app.get('/api/envios/:id/arquivos', async (req, res) => {
    const { id } = req.params;
    const { arquivo } = req.query;

    const result = await pool.query(
        'SELECT alerta, recorte_acoes, recorte_historico FROM envios WHERE id = $1',
        [id]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ erro: 'envio não encontrado' });
    }

    const envio = result.rows[0];

    if (arquivo && envio[arquivo]) {
        const buffer = Buffer.from(envio[arquivo], 'base64');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${arquivo}.csv"`);
        return res.send(buffer);
    }

    res.json({
        alerta: envio.alerta,
        recorte_acoes: envio.recorte_acoes,
        recorte_historico: envio.recorte_historico
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API rodando na porta ${PORT}`));