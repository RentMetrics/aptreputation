"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Navigation } from "@/components/navigation"
import { useConvex } from "@/hooks/useConvex"
import { Upload, FileText, CheckCircle, AlertCircle } from "lucide-react"

export default function AdminPage() {
  const [csvData, setCsvData] = useState("")
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{
    success: boolean
    message: string
    count?: number
  } | null>(null)

  const { bulkUploadProperties } = useConvex()

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setCsvData(text)
    }
    reader.readAsText(file)
  }

  const parseCSV = (csvText: string) => {
    const lines = csvText.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim())
    
    const properties = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim())
      const property: any = {}
      
      headers.forEach((header, index) => {
        property[header.toLowerCase().replace(/\s+/g, '')] = values[index]
      })
      
      return property
    })

    return properties
  }

  const handleBulkUpload = async () => {
    if (!csvData.trim()) {
      setUploadResult({
        success: false,
        message: "Please provide CSV data"
      })
      return
    }

    setIsUploading(true)
    setUploadResult(null)

    try {
      const properties = parseCSV(csvData)
      
      // Validate properties
      const validProperties = properties.filter(prop => 
        prop.name && prop.address && prop.city && prop.state && prop.zipcode
      )

      if (validProperties.length === 0) {
        setUploadResult({
          success: false,
          message: "No valid properties found in CSV"
        })
        return
      }

      // Transform to match schema
      const transformedProperties = validProperties.map(prop => ({
        name: prop.name,
        address: prop.address,
        city: prop.city,
        state: prop.state,
        zipCode: prop.zipcode,
      }))

      await bulkUploadProperties({ properties: transformedProperties })

      setUploadResult({
        success: true,
        message: `Successfully uploaded ${validProperties.length} properties to database`,
        count: validProperties.length
      })

      setCsvData("")
    } catch (error) {
      setUploadResult({
        success: false,
        message: `Error uploading properties: ${error}`
      })
    } finally {
      setIsUploading(false)
    }
  }

  const sampleCSV = `name,address,city,state,zipcode
Sunset Apartments,123 Main St,Austin,TX,78701
Riverside Heights,456 Oak Ave,Austin,TX,78702
Downtown Lofts,789 Pine St,Austin,TX,78703`

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      {/* Admin Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-gray-600">Manage properties and system settings</p>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="outline" asChild>
                <a href="/admin/bulk-upload">Excel Upload</a>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Bulk Property Upload */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Upload className="h-5 w-5 mr-2" />
              Bulk Property Upload
            </CardTitle>
            <CardDescription>
              Upload a CSV file with property data to populate the system. This enables the public-facing search functionality.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload CSV File
              </label>
              <Input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="cursor-pointer"
              />
              <p className="text-sm text-gray-500 mt-1">
                CSV should contain: name, address, city, state, zipcode
              </p>
            </div>

            {/* CSV Data Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Or paste CSV data directly
              </label>
              <textarea
                value={csvData}
                onChange={(e) => setCsvData(e.target.value)}
                placeholder="Paste CSV data here..."
                className="w-full h-32 p-3 border border-gray-300 rounded-md resize-none"
              />
            </div>

            {/* Sample CSV */}
            <div>
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-800">
                  View sample CSV format
                </summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded-md text-sm overflow-x-auto">
                  {sampleCSV}
                </pre>
              </details>
            </div>

            {/* Upload Button */}
            <Button 
              onClick={handleBulkUpload} 
              disabled={isUploading || !csvData.trim()}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Properties
                </>
              )}
            </Button>

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

        {/* System Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Properties</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                In database
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Paying customers
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reputation Audits</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                Today
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
} 