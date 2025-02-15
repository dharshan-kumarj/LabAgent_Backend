const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();

app.use(bodyParser.json({ limit: '50mb' }));
app.use(cors());

const JUDGE0_API = 'http://localhost:2358';
const MAX_POLLING_ATTEMPTS = 10;
const POLLING_INTERVAL = 2000; // 2 seconds

// Helper function to wait
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to poll for results
async function pollSubmission(token) {
    for (let attempt = 0; attempt < MAX_POLLING_ATTEMPTS; attempt++) {
        try {
            const response = await axios.get(`${JUDGE0_API}/submissions/${token}?base64_encoded=true`, {
                headers: { 'Content-Type': 'application/json' }
            });

            const result = response.data;
            
            // If the submission is not in queue or processing state, return the result
            if (result.status.id !== 1 && result.status.id !== 2) {
                return result;
            }

            // Wait before next polling attempt
            await sleep(POLLING_INTERVAL);
        } catch (error) {
            console.error(`Polling attempt ${attempt + 1} failed:`, error.message);
            if (attempt === MAX_POLLING_ATTEMPTS - 1) throw error;
            await sleep(POLLING_INTERVAL);
        }
    }
    throw new Error('Submission processing timeout');
}

app.post('/submit', async (req, res) => {
    const { sourceCode, languageId, stdin } = req.body;
    
    if (!sourceCode || !languageId) {
        return res.status(400).json({ 
            error: 'Source code and language ID are required',
            details: { sourceCode: !!sourceCode, languageId: !!languageId }
        });
    }

    try {
        console.log('Submitting code to Judge0...', new Date().toISOString());
        
        // Create submission
        const submission = {
            source_code: Buffer.from(sourceCode).toString('base64'),
            language_id: parseInt(languageId),
            stdin: stdin ? Buffer.from(stdin).toString('base64') : '',
            base64_encoded: true,
            wait: false  // Don't wait for the initial submission
        };

        // Submit the code
        const submitResponse = await axios.post(`${JUDGE0_API}/submissions`, submission, {
            headers: { 'Content-Type': 'application/json' }
        });

        const { token } = submitResponse.data;
        console.log(`Received submission token: ${token}`);

        // Poll for results
        console.log('Polling for results...');
        const resultData = await pollSubmission(token);

        // Decode the response
        const decodedResult = {
            ...resultData,
            stdout: resultData.stdout ? Buffer.from(resultData.stdout, 'base64').toString() : null,
            stderr: resultData.stderr ? Buffer.from(resultData.stderr, 'base64').toString() : null,
            compile_output: resultData.compile_output ? 
                Buffer.from(resultData.compile_output, 'base64').toString() : null,
            message: resultData.message ? 
                Buffer.from(resultData.message, 'base64').toString() : null
        };

        console.log('Final result:', {
            status: decodedResult.status,
            stdout: decodedResult.stdout,
            stderr: decodedResult.stderr,
            compile_output: decodedResult.compile_output
        });

        // Handle different status codes
        switch (decodedResult.status.id) {
            case 3: // Accepted
                return res.json(decodedResult);
            case 4: // Wrong Answer
                return res.json(decodedResult);
            case 5: // Time Limit Exceeded
                return res.status(400).json({
                    error: 'Time Limit Exceeded',
                    details: decodedResult
                });
            case 6: // Compilation Error
                return res.status(400).json({
                    error: 'Compilation Error',
                    details: decodedResult
                });
            case 13: // Internal Error
                return res.status(500).json({
                    error: 'Judge0 Internal Error',
                    details: decodedResult
                });
            default:
                return res.status(400).json({
                    error: `Submission Error: ${decodedResult.status.description}`,
                    details: decodedResult
                });
        }

    } catch (error) {
        console.error('Error in /submit:', error);
        res.status(500).json({
            error: 'Submission failed',
            details: error.response ? error.response.data : error.message
        });
    }
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        const response = await axios.get(`${JUDGE0_API}/about`);
        res.json({ status: 'ok', judge0: response.data });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            message: 'Unable to connect to Judge0',
            error: error.message 
        });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Judge0 API URL: ${JUDGE0_API}`);
});