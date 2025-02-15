const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

app.use(bodyParser.json());
app.use(cors()); // Enable CORS for all routes

const JUDGE0_API = 'http://localhost:2358';

app.post('/submit', async (req, res) => {
    const { sourceCode, languageId, stdin } = req.body;
    if (!sourceCode || !languageId) {
        console.error('Error: Source code and language ID are required');
        return res.status(400).json({ error: 'Source code and language ID are required' });
    }
    try {
        console.log('Submitting code to Judge0...');
        const response = await axios.post(`${JUDGE0_API}/submissions`, {
            source_code: sourceCode,
            language_id: languageId,
            stdin: stdin
        });
        const { token } = response.data;
        console.log(`Received submission token: ${token}`);
        setTimeout(async () => {
            try {
                console.log('Fetching result from Judge0...');
                const resultResponse = await axios.get(`${JUDGE0_API}/submissions/${token}`);
                const resultData = resultResponse.data;
                console.log('Result received successfully:', resultData);

                if (resultData.status.id !== 3) { // 3 means 'Accepted'
                    return res.status(400).json({ error: resultData.message || 'Execution error', details: resultData });
                }

                res.status(200).json(resultData);
            } catch (resultError) {
                console.error('Error fetching result from Judge0:', resultError.message);
                res.status(500).json({ error: 'Failed to fetch the result from Judge0' });
            }
        }, 3000); // Wait for 3 seconds before fetching the result
    } catch (error) {
        console.error('Error submitting code to Judge0:', error.message);
        res.status(500).json({ error: 'Failed to submit the code to Judge0' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});