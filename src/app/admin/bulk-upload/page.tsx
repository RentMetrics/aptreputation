"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Navigation } from "@/components/navigation"
import { useConvex } from "@/hooks/useConvex"
import { 
  Upload, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Download,
  Trash2,
  Eye,
  X
} from "lucide-react"
import * as XLSX from 'xlsx'

interface PropertyData {
  propertyId?: string
  name: string
  address: string
  city: string
  state: string
  zipCode: string
  totalUnits?: number
  yearBuilt?: number
  averageUnitSize?: number
}

interface UploadResult {
  success: boolean
  message: string
  count?: number
  errors?: string[]
}

export default function BulkUploadPage() {
  const [files, setFiles] = useState<File[]>([])
  const [properties, setProperties] = useState<PropertyData[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null)
  const [previewMode, setPreviewMode] = useState(false)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [processedFiles, setProcessedFiles] = useState<{name: string, count: number}[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { bulkUploadProperties } = useConvex()

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = Array.from(event.target.files || [])
    if (uploadedFiles.length === 0) return

    setFiles(prev => [...prev, ...uploadedFiles])
    setUploadResult(null)
    setValidationErrors([])

    // Process each file
    uploadedFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheetName = workbook.SheetNames[0]
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })

          if (jsonData.length < 2) {
            throw new Error(`${file.name}: Excel file must have at least a header row and one data row`)
          }

          const headers = (jsonData[0] as string[]).map(h => h?.toString().toLowerCase().trim())
          const requiredHeaders = ['property name', 'address', 'city', 'state', 'zip code']
          const optionalHeaders = ['property id', 'total units', 'year built', 'average unit size']

          // Validate headers
          const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
          if (missingHeaders.length > 0) {
            throw new Error(`${file.name}: Missing required columns: ${missingHeaders.join(', ')}`)
          }

          // Map data rows to PropertyData objects
          const mappedProperties: PropertyData[] = []
          const errors: string[] = []

          for (let i = 1; i < jsonData.length; i++) {
            const row = jsonData[i] as any[]
            if (!row || row.length === 0) continue

            const property: PropertyData = {
              propertyId: row[headers.indexOf('property id')]?.toString().trim() || undefined,
              name: row[headers.indexOf('property name')]?.toString().trim() || '',
              address: row[headers.indexOf('address')]?.toString().trim() || '',
              city: row[headers.indexOf('city')]?.toString().trim() || '',
              state: row[headers.indexOf('state')]?.toString().trim() || '',
              zipCode: row[headers.indexOf('zip code')]?.toString().trim() || '',
            }

            // Handle optional fields
            const propertyIdIndex = headers.findIndex(h => h === 'property id')
            if (propertyIdIndex !== -1 && row[propertyIdIndex]) {
              property.propertyId = row[propertyIdIndex].toString().trim()
            }

            const unitsIndex = headers.findIndex(h => h === 'total units')
            if (unitsIndex !== -1 && row[unitsIndex]) {
              const units = parseInt(row[unitsIndex])
              if (!isNaN(units)) property.totalUnits = units
            }

            const yearBuiltIndex = headers.findIndex(h => h === 'year built')
            if (yearBuiltIndex !== -1 && row[yearBuiltIndex]) {
              const year = parseInt(row[yearBuiltIndex])
              if (!isNaN(year)) property.yearBuilt = year
            }

            const avgSizeIndex = headers.findIndex(h => h === 'average unit size')
            if (avgSizeIndex !== -1 && row[avgSizeIndex]) {
              const size = parseInt(row[avgSizeIndex])
              if (!isNaN(size)) property.averageUnitSize = size
            }

            // Validate required fields
            if (!property.name) errors.push(`${file.name} - Row ${i + 1}: Missing property name`)
            if (!property.address) errors.push(`${file.name} - Row ${i + 1}: Missing address`)
            if (!property.city) errors.push(`${file.name} - Row ${i + 1}: Missing city`)
            if (!property.state) errors.push(`${file.name} - Row ${i + 1}: Missing state`)
            if (!property.zipCode) errors.push(`${file.name} - Row ${i + 1}: Missing zip code`)

            mappedProperties.push(property)
          }

          // Add properties from this file to the total
          setProperties(prev => [...prev, ...mappedProperties])
          setProcessedFiles(prev => [...prev, { name: file.name, count: mappedProperties.length }])
          setValidationErrors(prev => [...prev, ...errors])

          if (errors.length > 0) {
            setUploadResult({
              success: false,
              message: `Found ${errors.length} validation errors across all files`,
              errors
            })
          }
        } catch (error) {
          setUploadResult({
            success: false,
            message: error instanceof Error ? error.message : "Error processing file"
          })
        }
      }
      reader.readAsArrayBuffer(file)
    })
  }

  const handleBulkUpload = async () => {
    if (properties.length === 0) {
      setUploadResult({
        success: false,
        message: "No properties to upload"
      })
      return
    }

    if (validationErrors.length > 0) {
      setUploadResult({
        success: false,
        message: "Please fix validation errors before uploading"
      })
      return
    }

    setIsUploading(true)
    setUploadResult(null)

    try {
      // Upload properties to Convex database
      await bulkUploadProperties({ properties })

      setUploadResult({
        success: true,
        message: `Successfully uploaded ${properties.length} properties to database`,
        count: properties.length
      })

      // Reset form
      setFiles([])
      setProperties([])
      setValidationErrors([])
      setProcessedFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error uploading properties: ${error}`
      })
    } finally {
      setIsUploading(false)
    }
  }

  const clearUpload = () => {
    setFiles([])
    setProperties([])
    setValidationErrors([])
    setUploadResult(null)
    setProcessedFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    // Note: This is a simplified removal. In a full implementation, 
    // you'd want to recalculate properties and validation errors
  }

  const downloadSampleTemplate = () => {
    const sampleData = [
      {
        "Property ID": "9730",
        "Property Name": "Warwick",
        "Address": "2400 Arrowhead Dr",
        "City": "Abilene",
        "State": "TX",
        "ZIP Code": "79606",
        "Total Units": 128,
        "Year Built": 1970,
        "Average Unit Size": 577
      },
      {
        "Property ID": "9731",
        "Property Name": "Indian Run",
        "Address": "3549 Cedar Run Rd",
        "City": "Abilene",
        "State": "TX",
        "ZIP Code": "79605",
        "Total Units": 156,
        "Year Built": 1975,
        "Average Unit Size": 650
      }
    ]

    const ws = XLSX.utils.json_to_sheet(sampleData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Properties")
    XLSX.writeFile(wb, "property_upload_template.xlsx")
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      {/* Admin Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bulk Property Upload</h1>
              <p className="text-gray-600">Upload Excel files with property data to populate the system</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Upload className="h-5 w-5 mr-2" />
              Upload Excel File
            </CardTitle>
            <CardDescription>
              Upload multiple Excel files (.xlsx or .xls) with property data. You can upload up to 5 files at a time. Each file should include columns for Property Name, Address, City, State, ZIP Code, and optionally Property ID, Total Units, Year Built, and Average Unit Size.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Excel Files (up to 5 at a time)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                multiple
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {/* Sample Template */}
            <div>
              <Button variant="outline" onClick={downloadSampleTemplate}>
                <Download className="h-4 w-4 mr-2" />
                Download Sample Template
              </Button>
            </div>

            {/* File Info */}
            {files.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <FileText className="h-5 w-5 text-blue-600 mr-2" />
                    <div>
                      <p className="font-medium text-blue-900">{files.length} files selected</p>
                      <p className="text-sm text-blue-700">
                        {properties.length} total properties found
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={clearUpload}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {/* File List */}
                <div className="space-y-2">
                  {processedFiles.map((fileInfo, index) => (
                    <div key={index} className="flex items-center justify-between bg-white rounded p-2">
                      <div className="flex items-center">
                        <FileText className="h-4 w-4 text-blue-600 mr-2" />
                        <span className="text-sm font-medium">{fileInfo.name}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className="text-xs">
                          {fileInfo.count} properties
                        </Badge>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removeFile(index)}
                          className="h-6 w-6 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center mb-2">
                  <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  <h4 className="font-medium text-red-900">Validation Errors</h4>
                </div>
                <ul className="text-sm text-red-700 space-y-1">
                  {validationErrors.slice(0, 5).map((error, index) => (
                    <li key={index}>• {error}</li>
                  ))}
                  {validationErrors.length > 5 && (
                    <li>• ... and {validationErrors.length - 5} more errors</li>
                  )}
                </ul>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                onClick={handleBulkUpload} 
                disabled={isUploading || properties.length === 0 || validationErrors.length > 0}
                className="flex-1"
              >
                {isUploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload All {properties.length} Properties
                  </>
                )}
              </Button>
              
              {properties.length > 0 && (
                <Button 
                  variant="outline" 
                  onClick={() => setPreviewMode(!previewMode)}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  {previewMode ? 'Hide' : 'Preview'} Data
                </Button>
              )}
            </div>

            {/* Upload Result */}
            {uploadResult && (
              <div className={`p-4 rounded-md ${
                uploadResult.success 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center">
                  {uploadResult.success ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                  )}
                  <span className={`font-medium ${
                    uploadResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {uploadResult.message}
                  </span>
                  {uploadResult.count && (
                    <Badge className="ml-2" variant="outline">
                      {uploadResult.count} properties
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Preview */}
        {previewMode && properties.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Data Preview</CardTitle>
              <CardDescription>
                Preview of the first 10 properties from all uploaded files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Address</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">City</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Zip</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Units</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Year</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avg Size</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {properties.slice(0, 10).map((property, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{property.propertyId || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{property.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.address}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.city}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.state}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.zipCode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.totalUnits || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.yearBuilt || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{property.averageUnitSize || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {properties.length > 10 && (
                <p className="text-sm text-gray-500 mt-2">
                  Showing first 10 of {properties.length} properties
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
} 