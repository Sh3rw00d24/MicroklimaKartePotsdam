{{/*
Chart-Name, ggf. über nameOverride gekürzt/ersetzt.
*/}}
{{- define "stadtpuls-potsdam.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Vollqualifizierter Ressourcenname (Release + Chart-Name), Helm-Konvention.
*/}}
{{- define "stadtpuls-potsdam.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "stadtpuls-potsdam.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/*
Gemeinsame Labels auf allen Ressourcen.
*/}}
{{- define "stadtpuls-potsdam.labels" -}}
helm.sh/chart: {{ include "stadtpuls-potsdam.chart" . }}
{{ include "stadtpuls-potsdam.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{/*
Selector-Labels - auch vom Deployment und vom Service genutzt, muss also stabil bleiben.
*/}}
{{- define "stadtpuls-potsdam.selectorLabels" -}}
app.kubernetes.io/name: {{ include "stadtpuls-potsdam.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/*
Name des ServiceAccounts - eigener Name, vorgegebener Name oder "default".
*/}}
{{- define "stadtpuls-potsdam.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "stadtpuls-potsdam.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}
