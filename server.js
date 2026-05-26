const express = require('express');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { Resend } = require('resend');

const app = express();
app.use(express.json({ limit: '50mb' }));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const resend = new Resend(process.env.RESEND_API_KEY);

pool.query(`
    CREATE TABLE IF NOT EXISTS envios (
        id SERIAL PRIMARY KEY,
        cliente VARCHAR(100),
        comentario TEXT,
        timestamp TIMESTAMPTZ,
        alerta TEXT,
        recorte_acoes TEXT,
        recorte_historico TEXT,
        resumo JSONB,
        criado_em TIMESTAMPTZ DEFAULT NOW()
    )
`).then(() => console.log('Tabela pronta'));

pool.query(`ALTER TABLE envios ADD COLUMN IF NOT EXISTS resumo JSONB`)
.then(() => console.log('Coluna resumo adicionada'))
.catch(err => console.log('Erro coluna resumo:', err.message));

app.post('/api/dados', async (req, res) => {
    const { comentario, cliente, timestamp, arquivos, resumo } = req.body;

    // salva no banco
    await pool.query(
        `INSERT INTO envios (cliente, comentario, timestamp, alerta, recorte_acoes, recorte_historico, resumo)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [cliente, comentario, timestamp, arquivos.alerta, arquivos.recorte_acoes, arquivos.recorte_historico, JSON.stringify(resumo || {})]
    );

    // converte base64 para buffer para anexar no e-mail
    const alertaBuffer = Buffer.from(arquivos.alerta, 'base64');
    const acoesBuffer = Buffer.from(arquivos.recorte_acoes, 'base64');
    const historicoBuffer = Buffer.from(arquivos.recorte_historico, 'base64');

    // envia e-mail
    await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: ['uieda@hpb.com.br'],
        subject: `${cliente} - Novo Relatório Troubleshooting`,
        html: `
            <h2>Relatório Troubleshooting</h2>
            <p><strong>Cliente:</strong> ${cliente}</p>
            <p><strong>Data/Hora:</strong> ${new Date(timestamp).toLocaleString('pt-BR')}</p>

            ${resumo ? `
            <h3>Resumo do Checklist</h3>
            <p><strong>Concluído às:</strong> ${resumo.horario || 'não informado'}</p>

            ${resumo.algumProblema && resumo.problemas?.length > 0 ? `
            <p><strong>Problemas identificados:</strong></p>
            <ul>
                ${resumo.problemas.map(p => `<li>${p.problema}</li>`).join('')}
            </ul>
            ` : '<p>Nenhum problema identificado pelas verificações disponíveis.</p>'}
            ` : ''}

            ${comentario && comentario !== 'sem comentario' ? `
            <p><strong>Comentário do operador:</strong> ${comentario}</p>
            ` : ''}

            <hr>
            <p>Arquivos em anexo.</p>
        `,
        attachments: [
            {
                filename: 'alerta.csv',
                content: alertaBuffer
            },
            {
                filename: 'recorte_acoes.csv',
                content: acoesBuffer
            },
            {
                filename: 'recorte_historico.csv',
                content: historicoBuffer
            }
        ]
    });

    console.log('Recebido e e-mail enviado para:', cliente);
    res.status(200).json({ status: 'recebido' });
});

app.get('/api/envios', async (req, res) => {
    const result = await pool.query(
        'SELECT id, cliente, comentario, timestamp, criado_em FROM envios ORDER BY criado_em DESC'
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