"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Smartphone, 
  Settings, 
  Save, 
  ArrowLeft,
  Wifi,
  Key,
  HardDrive,
  Shield,
  CheckCircle,
  AlertCircle
} from "lucide-react"
import Link from "next/link"

export default function NFCSetupPage() {
  const [nfcData, setNfcData] = useState({
    tagType: "ISO 14443-3A",
    chip: "NXP - NTAG215",
    technologies: "Type A",
    serialNumber: "04:C2:88:D2:5F:61:80",
    atqa: "0x0044",
    sak: "0x00",
    protectedByPassword: "No",
    memoryInfo: "540 bytes : 135 pages (4 bytes each)",
    dataFormat: "NFC Forum Type 2",
    writable: "Yes"
  })

  const [assignedProperty, setAssignedProperty] = useState("")
  const [assignedLocation, setAssignedLocation] = useState("")
  const [reviewUrl, setReviewUrl] = useState("")

  const handleSave = () => {
    // Save NFC configuration to database
    console.log("Saving NFC configuration:", {
      ...nfcData,
      assignedProperty,
      assignedLocation,
      reviewUrl
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <Link href="/admin/dashboard">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">NFC Card Setup</h1>
              <p className="text-gray-600">Configure NFC review cards for your properties</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* NFC Tag Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Smartphone className="h-5 w-5 mr-2" />
                NFC Tag Details
              </CardTitle>
              <CardDescription>
                Technical specifications of the NFC card
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Tag Type */}
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center">
                  <Wifi className="h-4 w-4 text-blue-600 mr-2" />
                  <span className="font-medium">Tag Type</span>
                </div>
                <Badge variant="outline">{nfcData.tagType}</Badge>
              </div>

              {/* Chip */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <HardDrive className="h-4 w-4 text-gray-600 mr-2" />
                  <span className="font-medium">Chip</span>
                </div>
                <span className="text-sm text-gray-600">{nfcData.chip}</span>
              </div>

              {/* Technologies */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <Settings className="h-4 w-4 text-gray-600 mr-2" />
                  <span className="font-medium">Technologies</span>
                </div>
                <Badge variant="secondary">{nfcData.technologies}</Badge>
              </div>

              {/* Serial Number */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <Key className="h-4 w-4 text-gray-600 mr-2" />
                  <span className="font-medium">Serial Number</span>
                </div>
                <span className="text-sm font-mono text-gray-600">{nfcData.serialNumber}</span>
              </div>

              {/* ATQA */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm mr-2">A</span>
                  <span className="font-medium">ATQA</span>
                </div>
                <span className="text-sm font-mono text-gray-600">{nfcData.atqa}</span>
              </div>

              {/* SAK */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <span className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-sm mr-2">S</span>
                  <span className="font-medium">SAK</span>
                </div>
                <span className="text-sm font-mono text-gray-600">{nfcData.sak}</span>
              </div>

              {/* Protected by Password */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <Shield className="h-4 w-4 text-gray-600 mr-2" />
                  <span className="font-medium">Protected by Password</span>
                </div>
                <Badge variant={nfcData.protectedByPassword === "Yes" ? "destructive" : "secondary"}>
                  {nfcData.protectedByPassword}
                </Badge>
              </div>

              {/* Memory Information */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <HardDrive className="h-4 w-4 text-gray-600 mr-2" />
                  <span className="font-medium">Memory Information</span>
                </div>
                <span className="text-sm text-gray-600">{nfcData.memoryInfo}</span>
              </div>

              {/* Data Format */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <HardDrive className="h-4 w-4 text-gray-600 mr-2" />
                  <span className="font-medium">Data Format</span>
                </div>
                <Badge variant="outline">{nfcData.dataFormat}</Badge>
              </div>

              {/* Writable */}
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                  <span className="font-medium">Writable</span>
                </div>
                <Badge variant="default">{nfcData.writable}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Card Configuration
              </CardTitle>
              <CardDescription>
                Assign this NFC card to a property and location
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Property Assignment */}
              <div>
                <Label htmlFor="property">Assigned Property</Label>
                <Input
                  id="property"
                  placeholder="e.g., Sunset Apartments"
                  value={assignedProperty}
                  onChange={(e) => setAssignedProperty(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Location Assignment */}
              <div>
                <Label htmlFor="location">Assigned Location</Label>
                <Input
                  id="location"
                  placeholder="e.g., Front Desk, Pool Area, Lobby"
                  value={assignedLocation}
                  onChange={(e) => setAssignedLocation(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Review URL */}
              <div>
                <Label htmlFor="reviewUrl">Review URL</Label>
                <Input
                  id="reviewUrl"
                  placeholder="https://aptreputation.com/review/sunset-apartments"
                  value={reviewUrl}
                  onChange={(e) => setReviewUrl(e.target.value)}
                  className="mt-1"
                />
                <p className="text-sm text-gray-500 mt-1">
                  URL that residents will be directed to when they tap the card
                </p>
              </div>

              {/* Card Status */}
              <div className="bg-blue-50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Card Status</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Card ID</span>
                    <Badge variant="outline">NFC001</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Status</span>
                    <Badge variant="default">Ready to Deploy</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Last Configured</span>
                    <span className="text-sm text-gray-500">Never</span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-yellow-50 rounded-lg p-4">
                <h4 className="font-medium mb-2 flex items-center">
                  <AlertCircle className="h-4 w-4 text-yellow-600 mr-2" />
                  Setup Instructions
                </h4>
                <ol className="text-sm space-y-1">
                  <li>1. Configure the card settings above</li>
                  <li>2. Save the configuration</li>
                  <li>3. Physically write the data to the NFC card</li>
                  <li>4. Ship the card to the property</li>
                  <li>5. Monitor usage in the dashboard</li>
                </ol>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button 
                  className="flex-1" 
                  onClick={handleSave}
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save Configuration
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1"
                  disabled
                >
                  <Smartphone className="h-4 w-4 mr-2" />
                  Write to Card
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent NFC Cards */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recent NFC Cards</CardTitle>
            <CardDescription>
              Recently configured NFC cards and their status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                {
                  id: "NFC001",
                  property: "Sunset Apartments",
                  location: "Front Desk",
                  status: "Active",
                  lastUsed: "2 hours ago",
                  totalTaps: 47
                },
                {
                  id: "NFC002",
                  property: "Oakwood Properties",
                  location: "Lobby",
                  status: "Active",
                  lastUsed: "1 day ago",
                  totalTaps: 23
                },
                {
                  id: "NFC003",
                  property: "Vista Properties",
                  location: "Pool Area",
                  status: "Inactive",
                  lastUsed: "Never",
                  totalTaps: 0
                }
              ].map((card) => (
                <div key={card.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <Smartphone className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium">{card.id}</p>
                      <p className="text-sm text-gray-500">{card.property} - {card.location}</p>
                      <p className="text-xs text-gray-400">{card.totalTaps} total taps</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Last: {card.lastUsed}</p>
                    </div>
                    <Badge variant={card.status === "Active" ? "default" : "secondary"}>
                      {card.status}
                    </Badge>
                    <Button variant="outline" size="sm">
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
} 