---
aliases: '<% pname %>'
tags: <% tagsString %> Company_HQ
created_on:  <% tp.date.now("YYYY-MM-DD") %>
<% (country ? 'country: "' + country + '"': 'country:') %>
companyName: '<% shortName %>'
<% taxID ? 'taxID: "' + taxID + '"' : 'taxID' %>
parentCompany: <% parentCompany ? '"[[' + parentCompany + ']]"' : '' %>
record_type: <% recordType ? recordType : 'company_HQ' %>
---

# <% shortName %>

Официальный сайт: 

## Краткое описание

<% fullNameTitle ? fullNameTitle + '\n' : '' %><% companyAddress ? companyAddress + '\n' : '' %><%
 companyStatus.startsWith("Действующая") ?  companyStatus +'\n': '==' + companyStatus + '==\n'  %><%
  parentCompany ? 'Вышестоящая организация: [[' +  parentCompany + ']]\n' : '' %>

### 👨‍💼Сотрудники 

```dataview
TABLE WITHOUT ID link(file.name,ФИО) as "ФИО", country_residence as "Страна", Город, Должность, link(Фото,"50") as "Фото", dateformat(row.file.mtime, "yyyy-MM-dd") as "Обновлено"
from #Person/<% tagsString %> 
where record_type="personNote"
sort Страна, ФИО
```

---
## 📝Log

### <% tp.date.now("YYYY-MM-DD") %> - Начальная запись

notes_go_here
