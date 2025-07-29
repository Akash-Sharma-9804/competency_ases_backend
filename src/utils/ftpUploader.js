const ftp = require("basic-ftp");
const { Readable } = require("stream");
const { v4: uuidv4 } = require("uuid");
const path = require("path"); // add at top if not already
// async function uploadToFTP(buffer, originalName) {
//   const client = new ftp.Client();
//   client.ftp.verbose = true; // debug FTP steps
//   const uniqueName = `${Date.now()}-${uuidv4()}-${originalName}`;

//   try {
//     console.log("🌐 [FTP] Connecting...");
//     await client.access({
//       host: process.env.FTP_HOST,
//       user: process.env.FTP_USER,
//       password: process.env.FTP_PASS,
//       secure: false,
//       port: process.env.FTP_PORT,
//     });
//     console.log("✅ [FTP] Connected");

//     console.log("📁 [FTP] Navigating to:", process.env.FTP_REMOTE_DIR);
//     await client.ensureDir(process.env.FTP_REMOTE_DIR);
//     await client.cd(process.env.FTP_REMOTE_DIR);

//     console.log("⬆️ [FTP] Uploading file:", uniqueName);
//     const stream = Readable.from(buffer);
//     await client.uploadFrom(stream, uniqueName);

//     console.log("✅ [FTP] File uploaded");
//     client.close();

//     const publicUrl = `${process.env.FTP_BASE_URL}/${uniqueName}`;
//     console.log("🌐 [FTP] Public URL:", publicUrl);
//     return publicUrl;
//   } catch (err) {
//     client.close();
//     console.error("❌ [FTP] Upload error:", err);
//     throw err;
//   }
// }

async function uploadToFTP(buffer, originalName, subDir = "") {
  const client = new ftp.Client();
  client.ftp.verbose = true;
  const uniqueName = `${Date.now()}-${uuidv4()}-${originalName}`;

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
      port: process.env.FTP_PORT,
    });

  const targetDir = path.posix.join(process.env.FTP_REMOTE_DIR, subDir || "");
    await client.ensureDir(targetDir);
  await client.cd(path.posix.join("/", subDir || "")); // just "resumes" etc.


    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, uniqueName);
    client.close();

    const publicUrl = `${process.env.FTP_BASE_URL}/${subDir ? subDir + "/" : ""}${uniqueName}`;
    return publicUrl;
  } catch (err) {
    client.close();
    throw err;
  }
}


module.exports = uploadToFTP;
