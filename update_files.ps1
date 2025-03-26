!# Script to update all HTML files

# List of files to update
$files = @(
    ".\index.html"
) + (Get-ChildItem -Path ".\russia" -Filter "*.html" | Select-Object -ExpandProperty FullName)

foreach ($file in $files) {
    Write-Host "Updating file: $file"
    
    # Read file content
    $content = Get-Content -Path $file -Raw
    
    # Remove Yandex.Metrika
    $content = $content -replace '(?s)<!-- Yandex\.Metrika counter -->.+?<!-- /Yandex\.Metrika counter -->', ''
    
    # Remove Jivosite code
    $content = $content -replace '<script src="https://code\.jivosite\.com/widget/vD3HO5JgD0" async></script>', ''
    
    # Replace phone number in different contexts
    $content = $content -replace '8 \(800\) 300-98-03', '+7 999 822-53-95'
    $content = $content -replace '<i class="fa fa-phone" aria-hidden="true"></i><p>\+7 999 822-53-95</p>', '<a href="https://wa.me/79998225395" aria-label="Chat on WhatsApp"><img src="images/whats.png" alt="WhatsApp" style="width:24px; margin-right:5px;"></a><p>+7 999 822-53-95</p>'
    $content = $content -replace '<i class="fa fa-phone" aria-hidden="true"></i><p>\+7 999 822-53-95</p>', '<a href="https://wa.me/79998225395" aria-label="Chat on WhatsApp"><img src="../images/whats.png" alt="WhatsApp" style="width:24px; margin-right:5px;"></a><p>+7 999 822-53-95</p>'
    
    # Replace phone icon with WhatsApp in footer (across all variations that might exist)
    $content = $content -replace '<i class="fa fa-phone" aria-hidden="true"></i>(\s*)</div>(\s*)<div class="w3-address-right">(\s*)<h6>Телефон</h6>', '<i class="fa fa-whatsapp" aria-hidden="true"></i>$1</div>$2<div class="w3-address-right">$3<h6>WhatsApp</h6>'
    
    # Direct replacement for any remaining phone icons and headers in the footer
    $content = $content -replace '<i class="fa fa-phone" aria-hidden="true"></i>', '<i class="fa fa-whatsapp" aria-hidden="true"></i>'
    $content = $content -replace '<h6>Телефон</h6>', '<h6>WhatsApp</h6>'
    
    # Extra specific replacement for h6 tag in footer
    $content = $content -replace '<div class="w3-address-right">(\s*)<h6>Телефон</h6>', '<div class="w3-address-right">$1<h6>WhatsApp</h6>'
    
    # Replace phone links on tablet icons
    $content = $content -replace '<span class="contact-info__icon"><i class="ti-tablet"></i></span>', '<span class="contact-info__icon"><i class="fa fa-whatsapp"></i></span>'
    $content = $content -replace 'Телефон в России', 'WhatsApp'
    
    # Replace phone number links in footer
    $content = $content -replace '<p>\+7 999 822-53-95</p>', '<p><a href="https://wa.me/79998225395">+7 999 822-53-95</a></p>'
    
    # Replace email
    $content = $content -replace '(?s)<p>Email\s*:<a href=".*?</a></p>', '<p>Email: <a href="mailto:prava-RF-Online@mail.ru">prava-RF-Online@mail.ru</a></p>'
    $content = $content -replace '(?s)<h3><a href=".*?</a></h3>', '<h3><a href="mailto:prava-RF-Online@mail.ru">prava-RF-Online@mail.ru</a></h3>'
    
    # Replace phone image with WhatsApp in slider
    $content = $content -replace '<img src="images/tel.png" title="Phone" style="width:40px; margin-right: 10px;">', '<a href="https://wa.me/79998225395" aria-label="Chat on WhatsApp"><img src="images/whats.png" title="WhatsApp" style="width:40px; margin-right: 10px;"></a>'
    $content = $content -replace '<img src="../images/tel.png" title="Phone" style="width:40px; margin-right: 10px;">', '<a href="https://wa.me/79998225395" aria-label="Chat on WhatsApp"><img src="../images/whats.png" title="WhatsApp" style="width:40px; margin-right: 10px;"></a>'
    
    # Replace phone links with WhatsApp links
    $content = $content -replace '<a href="tel:88003009803"', '<a href="https://wa.me/79998225395"'
    
    # Remove IP comment in footer
    $content = $content -replace '<!-- IP: 2a03:6f00:6:1::b972:f7c5 -->', ''
    
    # Write updated content to file
    $content | Set-Content -Path $file
}

Write-Host "All files have been updated successfully!"
