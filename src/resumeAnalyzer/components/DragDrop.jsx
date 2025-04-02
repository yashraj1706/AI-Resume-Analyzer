import React, { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { FileUploader } from "react-drag-drop-files";
import { Button } from "@/components/ui/button";
import { AIChatSession } from "../../../service/AIModal";
import { LoaderCircle } from "lucide-react";

const ANALYSIS_PROMPT = `
You are ResumeChecker, an expert in resume analysis. Analyze the following resume and provide a detailed analysis in strict JSON format. 
1. Identify 5 key strengths of the resume. Each strength should be listed under "strengths". 
2. Suggest 3-5 areas for improvement under "recommendations". 
3. Provide section-wise improvements under "improvements". 

JSON Output Format: 
{
  "strengths": [{ "strength": "..." }],
  "recommendations": [{ "recommendation": "..." }],
  "improvements": [{ "improvement": "..." }]
}

Job Description: {job_description}
`;

const EXTRACT_PROMPT = `
You are an expert in resume parsing. Extract the resume data in the following strict JSON format. Ensure all fields are populated based on the content of the resume. If any field is missing, infer it from the context or leave it as null. Pay special attention to extracting education, experience, projects, and technical skills.

JSON Output Format:
{
  "resume_data": {
    "education": {
      "degree": "Degree Name (e.g., B.Tech in Computer Science)",
      "university": "University Name (e.g., XYZ University)"
    },
    "experience": [
      {
        "role": "Job Title (e.g., Software Engineer)",
        "organization": "Company Name (e.g., ABC Corp)",
        "responsibilities": ["Responsibility 1", "Responsibility 2"]
      }
    ],
    "projects": [
      {
        "name": "Project Name (e.g., AI Chatbot)",
        "description": ["Brief Project Description (e.g., Built a chatbot using GPT)"]
      }
    ],
    "technical_skills": {
      "Programming": ["Skill1 (e.g., Python)", "Skill2 (e.g., JavaScript)"],
      "Tools": ["Tool1 (e.g., Docker)", "Tool2 (e.g., Kubernetes)"],
      "Cloud": ["Cloud Platform (e.g., AWS)", "Cloud Platform (e.g., GCP)"]
    }
  }
}

Resume Content:
{resume_content}
`;

const fileTypes = ["PDF"];

function DragDrop() {
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [responseText, setResponseText] = useState(null);
  const [atsData, setAtsData] = useState(null);
  const [extractedData, setExtractedData] = useState(null);

  const handleChange = (file) => {
    setFile(file);
  };

  // Convert PDF to Base64
  const convertFileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = reader.result.split(",")[1];
        console.log("📄 Parsed PDF Base64:", base64); // Log the base64 content
        resolve(base64);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const sendRequestToGemini = async (base64File, prompt, callback) => {
    const requestPayload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "application/pdf", data: base64File } },
          ],
        },
      ],
    };
  
    console.log("📤 Gemini API Request Payload:", requestPayload);
  
    try {
      const result = await AIChatSession.sendMessage(JSON.stringify(requestPayload));
      const responseText = await result.response.text();
      console.log("✅ Gemini API Response:", responseText);
  
      try {
        const parsed = JSON.parse(responseText);
        callback(parsed);
      } catch (error) {
        console.error("❌ Error parsing Gemini JSON:", error);
        callback({ error: "Failed to parse Gemini response." });
      }
    } catch (error) {
      console.error("❌ Gemini API Error:", error);
      callback({ error: "Error connecting to Gemini API." });
    }
  };

  const sendRequestToATS = async (resumeData) => {
    try {
      console.log("📤 Sending to ATS API...");
  
      // Construct the request payload
      const requestPayload = {
        job_description: description, // Ensure this matches the job description
        resume_data: resumeData.resume_data, // Ensure this matches the resume data
      };
  
      console.log("📤 ATS API Request Payload:", JSON.stringify(requestPayload, null, 2));
  
      // Send the POST request to the ATS API
      const response = await fetch("https://minor-ats-api.onrender.com/evaluate-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json", // Ensure the Content-Type is set to JSON
        },
        body: JSON.stringify(requestPayload), // Convert the payload to a JSON string
      });
  
      // Check if the response is successful
      if (!response.ok) {
        throw new Error(`Failed to fetch ATS: ${response.status}`);
      }
  
      // Parse the response JSON
      const atsResult = await response.json();
      console.log("✅ ATS API Response:", atsResult);
  
      // Update the state with the ATS result
      setAtsData(atsResult);
    } catch (error) {
      console.error("❌ ATS API Error:", error);
      setAtsData({ error: "Error fetching ATS score." });
    }
  };

  const cleanExtractedData = (data) => {
    const cleanedData = { ...data };
  
    // Infer missing education fields
    if (!cleanedData.resume_data.education.degree) {
      cleanedData.resume_data.education.degree = "Unknown Degree";
    }
    if (!cleanedData.resume_data.education.university) {
      cleanedData.resume_data.education.university = "Unknown University";
    }
  
    // Ensure experience and projects are arrays
    cleanedData.resume_data.experience = cleanedData.resume_data.experience || [];
    cleanedData.resume_data.projects = cleanedData.resume_data.projects || [];
  
    // Ensure technical skills are populated
    cleanedData.resume_data.technical_skills = cleanedData.resume_data.technical_skills || {
      Programming: [],
      Tools: [],
      Cloud: [],
    };
  
    return cleanedData;
  };
  const handleAnalyzeClick = async () => {
    if (!file || !description) return alert("Please upload a file and job description.");
  
    setLoading(true);
  
    try {
      const base64File = await convertFileToBase64(file);
  
      // 1. Analyze Resume
      await sendRequestToGemini(base64File, ANALYSIS_PROMPT.replace("{job_description}", description), (data) => {
        console.log("✅ Gemini Analysis Data:", data);
        setResponseText(data);
      });
  
      // 2. Extract Data and Send to ATS
      await sendRequestToGemini(base64File, EXTRACT_PROMPT, (data) => {
        console.log("✅ Gemini Extracted Data (Before Cleaning):", data);
  
        // Clean the extracted data
        const cleanedData = cleanExtractedData(data);
        console.log("✅ Gemini Extracted Data (After Cleaning):", cleanedData);
  
        setExtractedData(cleanedData);
  
        // Send to ATS only if resume_data is valid
        if (cleanedData?.resume_data) {
          sendRequestToATS(cleanedData);
        } else {
          console.error("❌ Invalid resume data:", cleanedData);
          setAtsData({ error: "Invalid resume data. Please try again with a different file." });
        }
      });
    } catch (error) {
      console.error("❌ Error during analysis:", error);
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="flex flex-col items-center justify-center w-full p-6">
      <h1 className="text-2xl font-bold mb-4">Resume Analyzer</h1>

      <Textarea
        placeholder="Enter job description..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        required
        className="max-w-lg h-44 my-5"
      />

      <FileUploader handleChange={handleChange} name="file" types={fileTypes} />
      {file && <p className="text-green-500 mt-4">File uploaded: {file.name}</p>}

      <Button onClick={handleAnalyzeClick} disabled={loading}>
        {loading ? <LoaderCircle className="animate-spin" /> : "Analyze"}
      </Button>

      {/* {responseText && (
        <div className="mt-6 w-full bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Gemini Feedback:</h2>
          <pre className="text-sm overflow-x-auto">{JSON.stringify(responseText, null, 2)}</pre>
        </div>
      )}

      {extractedData && (
        <div className="mt-6 w-full bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Extracted Resume Data:</h2>
          <pre className="text-sm overflow-x-auto">{JSON.stringify(extractedData, null, 2)}</pre>
        </div>
      )}

      {atsData && (
        <div className="mt-6 w-full bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">ATS Score:</h2>
          {atsData.error ? (
            <p className="text-red-500">{atsData.error}</p>
          ) : (
            <p className="text-sm">Score: {atsData.score}%</p>
          )}
        </div>
      )}*/}

{responseText && (
  <div className="mt-6 w-full bg-gray-100 p-6 rounded-lg shadow-md">
    <h2 className="text-xl font-semibold mb-4 text-gray-800">Gemini Feedback</h2>
    <div className="space-y-4">
      {responseText.strengths && (
        <div>
          <h3 className="text-lg font-bold text-green-600">Strengths</h3>
          <ul className="list-disc list-inside text-gray-700">
            {responseText.strengths.map((item, index) => (
              <li key={index}>{item.strength}</li>
            ))}
          </ul>
        </div>
      )}
      {responseText.recommendations && (
        <div>
          <h3 className="text-lg font-bold text-blue-600">Recommendations</h3>
          <ul className="list-disc list-inside text-gray-700">
            {responseText.recommendations.map((item, index) => (
              <li key={index}>{item.recommendation}</li>
            ))}
          </ul>
        </div>
      )}
      {responseText.improvements && (
        <div>
          <h3 className="text-lg font-bold text-yellow-600">Improvements</h3>
          <ul className="list-disc list-inside text-gray-700">
            {responseText.improvements.map((item, index) => (
              <li key={index}>{item.improvement}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  </div>
)}

{atsData && (
  <div className="mt-6 w-full bg-gray-100 p-6 rounded-lg shadow-md">
    <h2 className="text-xl font-semibold mb-4 text-gray-800">ATS Score</h2>
    {atsData.error ? (
      <p className="text-red-500">{atsData.error}</p>
    ) : (
      <div className="space-y-2">
        <p className="text-lg font-bold text-gray-800">
          Final Score: <span className="text-green-600">{(atsData["Final Score"] * 100).toFixed(2)}%</span>
        </p>
        {/* <ul className="list-disc list-inside text-gray-700">
          {Object.entries(atsData).map(([key, value]) => {
            if (key !== "Final Score") {
              return (
                <li key={key}>
                  <span className="font-semibold">{key}:</span> {typeof value === "number" ? (value * 100).toFixed(2) + "%" : value}
                </li>
              );
            }
            return null;
          })}
        </ul> */}
      </div>
    )}
  </div>
)}
    </div>
  );
}

export default DragDrop;
