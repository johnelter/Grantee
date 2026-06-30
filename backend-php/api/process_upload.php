<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: POST");
header("Content-Type: application/json; charset=UTF-8");

$target_dir = "../uploads/";
// Ensure directory exists
if (!file_exists($target_dir)) {
    mkdir($target_dir, 0777, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_FILES['document'])) {
    $file = $_FILES['document'];
    $fileName = basename($file["name"]);
    
    // Generate a secure unique filename
    $fileType = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $newFileName = uniqid() . '.' . $fileType;
    $target_file = $target_dir . $newFileName;
    
    // Allow certain file formats
    $allowedTypes = array("pdf", "jpg", "png", "jpeg");
    if (!in_array($fileType, $allowedTypes)) {
        echo json_encode(["success" => false, "message" => "Only PDF, JPG, JPEG, & PNG files are allowed."]);
        exit;
    }

    if (move_uploaded_file($file["tmp_name"], $target_file)) {
        // Return the path so the Node.js OCR service or frontend can access it
        echo json_encode([
            "success" => true, 
            "message" => "File uploaded successfully.",
            "filePath" => "/uploads/" . $newFileName
        ]);
    } else {
        echo json_encode(["success" => false, "message" => "Sorry, there was an error uploading your file."]);
    }
} else {
    echo json_encode(["success" => false, "message" => "No file sent."]);
}
?>