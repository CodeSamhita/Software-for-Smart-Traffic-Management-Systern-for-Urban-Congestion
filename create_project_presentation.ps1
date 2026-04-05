param(
    [string]$OutputPath = "Smart_Traffic_Management_Capstone_Presentation.pptx"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

function New-ZipEntryFromString {
    param(
        [Parameter(Mandatory = $true)] [System.IO.Compression.ZipArchive] $Archive,
        [Parameter(Mandatory = $true)] [string] $EntryName,
        [Parameter(Mandatory = $true)] [string] $Content
    )

    $entry = $Archive.CreateEntry($EntryName)
    $writer = New-Object System.IO.StreamWriter($entry.Open(), [System.Text.Encoding]::UTF8)
    try {
        $writer.Write($Content)
    }
    finally {
        $writer.Dispose()
    }
}

function Escape-Xml {
    param([string]$Value)

    if ($null -eq $Value) {
        return ""
    }

    return [System.Security.SecurityElement]::Escape($Value)
}

function New-ParagraphXml {
    param(
        [Parameter(Mandatory = $true)] [string] $Text,
        [int] $Level = 0,
        [switch] $Bold,
        [int] $FontSize = 2400,
        [string] $Color = "1F2937",
        [string] $BulletCharacter = [char]0x2022
    )

    $escapedText = Escape-Xml $Text
    $boldValue = if ($Bold) { ' b="1"' } else { "" }
    $bulletXml = if ($Level -ge 0) {
        "<a:buChar char='$BulletCharacter'/>"
    }
    else {
        "<a:buNone/>"
    }
    $indentLevel = if ($Level -lt 0) { 0 } else { $Level }

    return @"
<a:p>
  <a:pPr lvl="$indentLevel"/>
  $bulletXml
  <a:r>
    <a:rPr lang="en-IN" sz="$FontSize"$boldValue dirty="0" smtClean="0">
      <a:solidFill><a:srgbClr val="$Color"/></a:solidFill>
      <a:latin typeface="Aptos"/>
    </a:rPr>
    <a:t>$escapedText</a:t>
  </a:r>
  <a:endParaRPr lang="en-IN" sz="$FontSize" dirty="0">
    <a:solidFill><a:srgbClr val="$Color"/></a:solidFill>
    <a:latin typeface="Aptos"/>
  </a:endParaRPr>
</a:p>
"@
}

function New-TitleParagraphXml {
    param(
        [Parameter(Mandatory = $true)] [string] $Text,
        [int] $FontSize = 2800,
        [string] $Color = "FFFFFF"
    )

    $escapedText = Escape-Xml $Text

    return @"
<a:p>
  <a:pPr algn="l"/>
  <a:buNone/>
  <a:r>
    <a:rPr lang="en-IN" sz="$FontSize" b="1" dirty="0" smtClean="0">
      <a:solidFill><a:srgbClr val="$Color"/></a:solidFill>
      <a:latin typeface="Aptos Display"/>
    </a:rPr>
    <a:t>$escapedText</a:t>
  </a:r>
  <a:endParaRPr lang="en-IN" sz="$FontSize" b="1" dirty="0">
    <a:solidFill><a:srgbClr val="$Color"/></a:solidFill>
    <a:latin typeface="Aptos Display"/>
  </a:endParaRPr>
</a:p>
"@
}

function New-TextBoxXml {
    param(
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [int] $Id,
        [Parameter(Mandatory = $true)] [int] $X,
        [Parameter(Mandatory = $true)] [int] $Y,
        [Parameter(Mandatory = $true)] [int] $Cx,
        [Parameter(Mandatory = $true)] [int] $Cy,
        [Parameter(Mandatory = $true)] [string[]] $ParagraphsXml
    )

    $paragraphBlock = ($ParagraphsXml -join "`n")
    $escapedName = Escape-Xml $Name

    return @"
<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="$Id" name="$escapedName"/>
    <p:cNvSpPr txBox="1"/>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm>
      <a:off x="$X" y="$Y"/>
      <a:ext cx="$Cx" cy="$Cy"/>
    </a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:noFill/>
    <a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"/>
    <a:lstStyle/>
    $paragraphBlock
  </p:txBody>
</p:sp>
"@
}

function New-BannerXml {
    param(
        [Parameter(Mandatory = $true)] [string] $Name,
        [Parameter(Mandatory = $true)] [int] $Id,
        [Parameter(Mandatory = $true)] [int] $X,
        [Parameter(Mandatory = $true)] [int] $Y,
        [Parameter(Mandatory = $true)] [int] $Cx,
        [Parameter(Mandatory = $true)] [int] $Cy,
        [Parameter(Mandatory = $true)] [string] $FillColor
    )

    $escapedName = Escape-Xml $Name

    return @"
<p:sp>
  <p:nvSpPr>
    <p:cNvPr id="$Id" name="$escapedName"/>
    <p:cNvSpPr/>
    <p:nvPr/>
  </p:nvSpPr>
  <p:spPr>
    <a:xfrm>
      <a:off x="$X" y="$Y"/>
      <a:ext cx="$Cx" cy="$Cy"/>
    </a:xfrm>
    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
    <a:solidFill><a:srgbClr val="$FillColor"/></a:solidFill>
    <a:ln><a:noFill/></a:ln>
  </p:spPr>
  <p:style>
    <a:lnRef idx="1"><a:schemeClr val="accent1"/></a:lnRef>
    <a:fillRef idx="3"><a:schemeClr val="accent1"/></a:fillRef>
    <a:effectRef idx="2"><a:schemeClr val="accent1"/></a:effectRef>
    <a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef>
  </p:style>
  <p:txBody>
    <a:bodyPr/>
    <a:lstStyle/>
    <a:p><a:endParaRPr lang="en-IN"/></a:p>
  </p:txBody>
</p:sp>
"@
}

function New-SlideXml {
    param(
        [Parameter(Mandatory = $true)] [string] $Title,
        [Parameter(Mandatory = $true)] [string[]] $BodyLines,
        [string] $Subtitle = "",
        [string] $Footer = "Capstone Project Presentation",
        [string] $BannerColor = "0F4C81"
    )

    $shapes = @()
    $shapeId = 2

    $shapes += New-BannerXml -Name "Title Banner" -Id $shapeId -X 0 -Y 0 -Cx 12192000 -Cy 900000 -FillColor $BannerColor
    $shapeId++

    $titleParagraphs = @(New-TitleParagraphXml -Text $Title)
    $shapes += New-TextBoxXml -Name "Slide Title" -Id $shapeId -X 548640 -Y 180000 -Cx 10900000 -Cy 420000 -ParagraphsXml $titleParagraphs
    $shapeId++

    if ($Subtitle) {
        $subtitleParagraphs = @(New-ParagraphXml -Text $Subtitle -Level -1 -FontSize 1800 -Color "475569")
        $shapes += New-TextBoxXml -Name "Slide Subtitle" -Id $shapeId -X 640080 -Y 1100000 -Cx 10800000 -Cy 420000 -ParagraphsXml $subtitleParagraphs
        $shapeId++
    }

    $bodyParagraphs = @()
    foreach ($line in $BodyLines) {
        $bodyParagraphs += New-ParagraphXml -Text $line -Level 0 -FontSize 2200 -Color "111827"
    }
    $shapes += New-TextBoxXml -Name "Slide Body" -Id $shapeId -X 731520 -Y 1650000 -Cx 10400000 -Cy 4300000 -ParagraphsXml $bodyParagraphs
    $shapeId++

    $footerParagraphs = @(New-ParagraphXml -Text $Footer -Level -1 -FontSize 1200 -Color "64748B")
    $shapes += New-TextBoxXml -Name "Slide Footer" -Id $shapeId -X 731520 -Y 6500000 -Cx 10400000 -Cy 220000 -ParagraphsXml $footerParagraphs

    $shapeBlock = ($shapes -join "`n")

    return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
      $shapeBlock
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr>
    <a:masterClrMapping/>
  </p:clrMapOvr>
</p:sld>
"@
}

$slides = @(
    @{
        Title = "Smart Traffic Management System for Urban Congestion"
        Subtitle = "Capstone project presentation"
        Body = @(
            "AI-assisted traffic monitoring platform for mixed urban roads and adaptive junction management.",
            "Combines the original HTML simulation with a live Python vision dashboard.",
            "Processes camera, image, and video sources in one workflow.",
            "Supports cloud AI suggestions with offline-safe fallback."
        )
        Footer = "Project theme: traffic analytics, adaptive control, and operational decision support"
    },
    @{
        Title = "Problem Statement"
        Subtitle = "Why the project matters"
        Body = @(
            "Urban junctions face recurring congestion and irregular mixed-traffic flow.",
            "Fixed signal timing does not adapt well to buses, trucks, motorcycles, and pedestrians.",
            "Manual traffic monitoring is slow and difficult to scale.",
            "The project converts live traffic scenes into measurable analytics and operator guidance."
        )
        Footer = "Focus context: Indian-style mixed traffic and dynamic junction behavior"
    },
    @{
        Title = "Project Objectives"
        Subtitle = "Core goals of the capstone"
        Body = @(
            "Detect and classify traffic participants from live feeds, images, and videos.",
            "Estimate congestion, mobility, throughput, and corridor pressure.",
            "Support north, east, south, and west directional analysis.",
            "Generate operational suggestions using AI and offline rules."
        )
        Footer = "Objective alignment: visibility, analytics, and intervention support"
    },
    @{
        Title = "Solution Overview"
        Subtitle = "Two connected layers in one project"
        Body = @(
            "Layer 1: HTML simulation prototype for adaptive junction behavior and analytics.",
            "Layer 2: Python traffic-vision platform for real footage analysis.",
            "New dashboard and control-center interfaces extend the original concept.",
            "The project moves from simulation-only logic toward real-world traffic monitoring."
        )
        Footer = "Project structure: simulation plus live AI-powered monitoring"
    },
    @{
        Title = "System Workflow"
        Subtitle = "How data moves through the platform"
        Body = @(
            "Input sources include camera streams, uploaded media, local files, and video feeds.",
            "FrameSourceManager reads the selected source and sends frames to the processor.",
            "YOLO performs object detection, with OpenCV motion detection as fallback.",
            "Tracking and analytics convert detections into live metrics and recommendations."
        )
        Footer = "Pipeline summary: source -> detection -> tracking -> analytics -> advisory -> dashboard"
    },
    @{
        Title = "Updated Code Features"
        Subtitle = "Recent implementation-level improvements"
        Body = @(
            "Processor now manages operator state such as mode, override corridor, manual priority, and simulation pause.",
            "Zone center values can be adjusted dynamically for better corridor splitting.",
            "Control-center route adds an analysis-to-simulation workflow beyond the basic dashboard.",
            "Current state API returns live analytics together with operator and simulation state."
        )
        Footer = "These updates make the system closer to an operator-facing smart traffic console"
    },
    @{
        Title = "Analytics and Scoring"
        Subtitle = "What the system measures"
        Body = @(
            "Weighted scoring treats heavy vehicles, two-wheelers, and pedestrians differently.",
            "Corridor pressure is computed from density, motion, penalties, and spillover.",
            "Congestion index and mobility score summarize overall junction conditions.",
            "The hottest corridor is selected for controller notes and intervention guidance."
        )
        Footer = "Analytics are tuned for mixed urban traffic conditions"
    },
    @{
        Title = "Dashboard and Control Center"
        Subtitle = "User-facing capabilities"
        Body = @(
            "Live annotated traffic feed with metrics and trend charts.",
            "Source switching and media upload without restarting the system.",
            "Separate north, south, east, and west views in the control-center flow.",
            "Alerts, AI suggestions, class breakdown, and corridor pressure displayed in one interface."
        )
        Footer = "Available routes include /dashboard and /control-center"
    },
    @{
        Title = "Technology Stack"
        Subtitle = "Implementation choices"
        Body = @(
            "Frontend uses HTML, CSS, and JavaScript for dashboard interaction.",
            "Backend uses Python and Flask for APIs and live processing.",
            "OpenCV handles image processing and fallback motion detection.",
            "Ultralytics YOLO powers object detection and class recognition.",
            "PowerShell launch scripts support Windows-friendly setup and execution."
        )
        Footer = "The stack is practical for a capstone demo on Windows"
    },
    @{
        Title = "Strengths and Benefits"
        Subtitle = "What the project delivers"
        Body = @(
            "Bridges the gap between conceptual simulation and real footage analysis.",
            "Continues working through fallback paths in detection and advisory layers.",
            "Supports mixed urban traffic rather than only simple lane-based scenarios.",
            "Provides a strong base for smart control-room and digital-twin extensions."
        )
        Footer = "A major strength is graceful degradation instead of total failure"
    },
    @{
        Title = "Limitations and Future Scope"
        Subtitle = "Where the project can grow next"
        Body = @(
            "Recognition quality still depends on the selected YOLO model weights.",
            "Indian-specific classes can improve with custom fine-tuned datasets.",
            "Future work can add helmet checks, lane-violation detection, and emergency priority.",
            "The system can expand to multi-junction coordination and municipal integration."
        )
        Footer = "The repository already identifies several realistic extension paths"
    },
    @{
        Title = "Conclusion"
        Subtitle = "Capstone takeaway"
        Body = @(
            "The project demonstrates a practical smart traffic management workflow.",
            "It combines simulation, computer vision, analytics, and AI-assisted recommendations.",
            "The updated codebase is more modular, interactive, and operator-oriented.",
            "With custom models and broader integration, it can grow into a stronger real-world system."
        )
        Footer = "Thank you"
    }
)

$outputFile = Join-Path (Get-Location) $OutputPath
if (Test-Path $outputFile) {
    Remove-Item $outputFile -Force
}

$fileStream = [System.IO.File]::Open($outputFile, [System.IO.FileMode]::Create)
try {
    $archive = New-Object System.IO.Compression.ZipArchive($fileStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
    try {
        New-ZipEntryFromString -Archive $archive -EntryName "[Content_Types].xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  $(for ($i = 1; $i -le $slides.Count; $i++) { "<Override PartName=`"/ppt/slides/slide$i.xml`" ContentType=`"application/vnd.openxmlformats-officedocument.presentationml.slide+xml`"/>" })
</Types>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "_rels/.rels" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "docProps/core.xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:dcmitype="http://purl.org/dc/dcmitype/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Smart Traffic Management Capstone Presentation</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-03-20T00:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-03-20T00:00:00Z</dcterms:modified>
</cp:coreProperties>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "docProps/app.xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Office PowerPoint</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Slides>$($slides.Count)</Slides>
  <Notes>0</Notes>
  <HiddenSlides>0</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs>
    <vt:vector size="2" baseType="variant">
      <vt:variant><vt:lpstr>Slides</vt:lpstr></vt:variant>
      <vt:variant><vt:i4>$($slides.Count)</vt:i4></vt:variant>
    </vt:vector>
  </HeadingPairs>
  <TitlesOfParts>
    <vt:vector size="$($slides.Count)" baseType="lpstr">
      $(foreach ($slide in $slides) { "<vt:lpstr>$(Escape-Xml $slide.Title)</vt:lpstr>" })
    </vt:vector>
  </TitlesOfParts>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>16.0000</AppVersion>
</Properties>
"@

        $slideIdEntries = @()
        $slideRelEntries = @()
        for ($i = 1; $i -le $slides.Count; $i++) {
            $slideIdEntries += "<p:sldId id=""$(255 + $i)"" r:id=""rId$($i + 1)""/>"
            $slideRelEntries += "<Relationship Id=""rId$($i + 1)"" Type=""http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"" Target=""slides/slide$i.xml""/>"
        }

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/presentation.xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                saveSubsetFonts="1"
                autoCompressPictures="0">
  <p:sldMasterIdLst>
    <p:sldMasterId id="2147483648" r:id="rId1"/>
  </p:sldMasterIdLst>
  <p:sldIdLst>
    $($slideIdEntries -join "`n    ")
  </p:sldIdLst>
  <p:sldSz cx="12192000" cy="6858000" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle>
    <a:defPPr/>
    <a:lvl1pPr marL="342900" indent="-285750"/>
    <a:lvl2pPr marL="742950" indent="-285750"/>
    <a:lvl3pPr marL="1143000" indent="-285750"/>
  </p:defaultTextStyle>
</p:presentation>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/_rels/presentation.xml.rels" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  $($slideRelEntries -join "`n  ")
</Relationships>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/slideMasters/slideMaster1.xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld name="Master">
    <p:bg>
      <p:bgPr>
        <a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>
        <a:effectLst/>
      </p:bgPr>
    </p:bg>
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:sldLayoutIdLst>
    <p:sldLayoutId id="1" r:id="rId1"/>
  </p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr algn="l"/></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr algn="l"/></p:bodyStyle>
    <p:otherStyle><a:lvl1pPr algn="l"/></p:otherStyle>
  </p:txStyles>
</p:sldMaster>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/slideMasters/_rels/slideMaster1.xml.rels" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/slideLayouts/slideLayout1.xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             type="blank"
             preserve="1">
  <p:cSld name="Blank">
    <p:spTree>
      <p:nvGrpSpPr>
        <p:cNvPr id="1" name=""/>
        <p:cNvGrpSpPr/>
        <p:nvPr/>
      </p:nvGrpSpPr>
      <p:grpSpPr>
        <a:xfrm>
          <a:off x="0" y="0"/>
          <a:ext cx="0" cy="0"/>
          <a:chOff x="0" y="0"/>
          <a:chExt cx="0" cy="0"/>
        </a:xfrm>
      </p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/slideLayouts/_rels/slideLayout1.xml.rels" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>
"@

        New-ZipEntryFromString -Archive $archive -EntryName "ppt/theme/theme1.xml" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Codex Theme">
  <a:themeElements>
    <a:clrScheme name="Codex Colors">
      <a:dk1><a:srgbClr val="111827"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="0F172A"/></a:dk2>
      <a:lt2><a:srgbClr val="F8FAFC"/></a:lt2>
      <a:accent1><a:srgbClr val="0F4C81"/></a:accent1>
      <a:accent2><a:srgbClr val="0EA5E9"/></a:accent2>
      <a:accent3><a:srgbClr val="10B981"/></a:accent3>
      <a:accent4><a:srgbClr val="F97316"/></a:accent4>
      <a:accent5><a:srgbClr val="F59E0B"/></a:accent5>
      <a:accent6><a:srgbClr val="8B5CF6"/></a:accent6>
      <a:hlink><a:srgbClr val="2563EB"/></a:hlink>
      <a:folHlink><a:srgbClr val="7C3AED"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="Codex Fonts">
      <a:majorFont>
        <a:latin typeface="Aptos Display"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:majorFont>
      <a:minorFont>
        <a:latin typeface="Aptos"/>
        <a:ea typeface=""/>
        <a:cs typeface=""/>
      </a:minorFont>
    </a:fontScheme>
    <a:fmtScheme name="Codex Format">
      <a:fillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:satMod val="105000"/><a:lumMod val="103000"/><a:shade val="73000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs>
            <a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs>
            <a:gs pos="100000"><a:schemeClr val="phClr"><a:satMod val="120000"/><a:lumMod val="99000"/><a:shade val="78000"/></a:schemeClr></a:gs>
          </a:gsLst>
          <a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>
        </a:gradFill>
      </a:fillStyleLst>
      <a:lnStyleLst>
        <a:ln w="9525" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="25400" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
        <a:ln w="38100" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>
      </a:lnStyleLst>
      <a:effectStyleLst>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
        <a:effectStyle><a:effectLst/></a:effectStyle>
      </a:effectStyleLst>
      <a:bgFillStyleLst>
        <a:solidFill><a:schemeClr val="phClr"/></a:solidFill>
        <a:solidFill><a:schemeClr val="lt1"/></a:solidFill>
        <a:gradFill rotWithShape="1">
          <a:gsLst>
            <a:gs pos="0"><a:schemeClr val="lt1"/></a:gs>
            <a:gs pos="100000"><a:schemeClr val="lt2"/></a:gs>
          </a:gsLst>
          <a:lin ang="5400000" scaled="0"/>
        </a:gradFill>
      </a:bgFillStyleLst>
    </a:fmtScheme>
  </a:themeElements>
  <a:objectDefaults/>
  <a:extraClrSchemeLst/>
</a:theme>
"@

        for ($i = 1; $i -le $slides.Count; $i++) {
            $slide = $slides[$i - 1]
            $xml = New-SlideXml -Title $slide.Title -Subtitle $slide.Subtitle -BodyLines $slide.Body -Footer $slide.Footer
            New-ZipEntryFromString -Archive $archive -EntryName "ppt/slides/slide$i.xml" -Content $xml
            New-ZipEntryFromString -Archive $archive -EntryName "ppt/slides/_rels/slide$i.xml.rels" -Content @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>
"@
        }
    }
    finally {
        $archive.Dispose()
    }
}
finally {
    $fileStream.Dispose()
}

Write-Host "Presentation created at $outputFile"
