// Jenkinsfile — BudgetMate API DevOps pipeline
// SIT223/SIT753 High Distinction Task: DevOps Pipeline with Jenkins
// Diran Shenuk Paul De Silva Jayasinghage (s224764189)
//
// Declarative pipeline implementing all 7 required stages end-to-end:
//   Build -> Test -> Code Quality -> Security -> Deploy -> Release -> Monitoring
//
// Required Jenkins plugins: Pipeline, Docker Pipeline, JUnit, HTML Publisher,
// SonarQube Scanner, Credentials Binding. See RUNNING.md for exact setup.

pipeline {
  agent any

  options {
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '20'))
    disableConcurrentBuilds()
  }

  environment {
    IMAGE_NAME        = 'budgetmate-api'
    IMAGE_TAG         = "${env.BUILD_NUMBER}"
    STAGING_URL       = 'http://localhost:3100'
    PROD_URL          = 'http://localhost:3000'
    // Configured once in Manage Jenkins > System > SonarQube servers
    SONARQUBE_SERVER  = 'sonarqube-local'
  }

  stages {

    // ---------------------------------------------------------------
    // 1. BUILD — produce a versioned, tested Docker image artefact
    // ---------------------------------------------------------------
    stage('Build') {
      steps {
        echo "Building ${IMAGE_NAME}:${IMAGE_TAG}"
        sh 'node --version && npm --version'
        // The multi-stage Dockerfile runs `npm test` internally during the
        // build stage of the image itself, so a build can never succeed
        // and produce a taggable artefact if the test suite fails.
        sh "docker build -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest ."
        sh "docker save ${IMAGE_NAME}:${IMAGE_TAG} -o ${IMAGE_NAME}-${IMAGE_TAG}.tar"
      }
      post {
        success {
          archiveArtifacts artifacts: "${IMAGE_NAME}-${IMAGE_TAG}.tar", fingerprint: true
        }
      }
    }

    // ---------------------------------------------------------------
    // 2. TEST — run the automated suite outside the image too, with
    //    JUnit-formatted output Jenkins can trend over time
    // ---------------------------------------------------------------
    stage('Test') {
      steps {
        sh 'npm install --no-audit --no-fund'
        sh 'npm test'
      }
      post {
        always {
          junit testResults: 'test-results.xml', allowEmptyResults: false
        }
      }
    }

    // ---------------------------------------------------------------
    // 3. CODE QUALITY — structure/style/maintainability, not security
    // ---------------------------------------------------------------
    stage('Code Quality') {
      steps {
        sh 'npx eslint . -f json -o eslint-report.json'
        withSonarQubeEnv("${SONARQUBE_SERVER}") {
          sh 'sonar-scanner'
        }
      }
      post {
        always {
          archiveArtifacts artifacts: 'eslint-report.json', allowEmptyArchive: true
        }
      }
    }

    // Gate the pipeline on Sonar's quality gate before anything security-
    // or deploy-related runs. Kept as its own stage so a quality-gate
    // timeout/failure is unambiguous in the Jenkins stage view.
    stage('Quality Gate') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    // ---------------------------------------------------------------
    // 4. SECURITY — dependency + container image scanning
    //    (see SECURITY.md for the full policy this stage implements)
    // ---------------------------------------------------------------
    stage('Security') {
      steps {
        // Production dependency tree: expected clean by design (zero
        // runtime deps). Full tree (incl. devDependencies) still audited.
        sh 'npm audit --omit=dev --audit-level=high || true'
        sh 'npm audit --audit-level=high --json > npm-audit-report.json || true'

        // Container image scan — OS-package-level CVEs in node:22-alpine
        // that npm audit cannot see. Fails the stage on High/Critical.
        sh "trivy image --severity HIGH,CRITICAL --exit-code 1 --format json --output trivy-report.json ${IMAGE_NAME}:${IMAGE_TAG}"
      }
      post {
        always {
          archiveArtifacts artifacts: 'npm-audit-report.json,trivy-report.json', allowEmptyArchive: true
        }
      }
    }

    // ---------------------------------------------------------------
    // 5. DEPLOY — automated deploy to a staging environment + smoke test
    // ---------------------------------------------------------------
    stage('Deploy') {
      steps {
        sh "IMAGE_TAG=${IMAGE_TAG} docker compose -f docker-compose.staging.yml up -d --build"
        // Give the container's HEALTHCHECK a moment to go green before
        // hitting it directly with the smoke test.
        sh 'sleep 8'
        sh "node scripts/smoke-check.js ${STAGING_URL}"
      }
    }

    // ---------------------------------------------------------------
    // 6. RELEASE — manual promotion gate, then tag + promote to "prod"
    // ---------------------------------------------------------------
    stage('Release Approval') {
      steps {
        timeout(time: 30, unit: 'MINUTES') {
          input message: "Promote build ${IMAGE_TAG} from staging to production?", ok: 'Release'
        }
      }
    }

    stage('Release') {
      steps {
        script {
          env.RELEASE_TAG = "v1.0.${IMAGE_TAG}"
        }
        sh "git tag -a ${RELEASE_TAG} -m 'Release ${RELEASE_TAG}'"
        withCredentials([usernamePassword(credentialsId: 'github-token', usernameVariable: 'GIT_USER', passwordVariable: 'GIT_TOKEN')]) {
          sh "git push https://${GIT_USER}:${GIT_TOKEN}@github.com/${GIT_USER}/budgetmate-devops.git ${RELEASE_TAG}"
        }
        sh "node scripts/generate-release-notes.js ${RELEASE_TAG}"
        sh "docker tag ${IMAGE_NAME}:${IMAGE_TAG} ${IMAGE_NAME}:prod"
        sh "IMAGE_TAG=prod RELEASE_TAG=${RELEASE_TAG} docker compose -f docker-compose.prod.yml up -d"
        sh 'sleep 8'
        sh "node scripts/smoke-check.js ${PROD_URL}"
      }
      post {
        success {
          archiveArtifacts artifacts: 'RELEASE_NOTES.md', allowEmptyArchive: true
        }
      }
    }

    // ---------------------------------------------------------------
    // 7. MONITORING — bring up/refresh the monitoring stack, verify
    //    the freshly released production service is actually visible
    //    to it, and alert immediately if the release is unhealthy
    // ---------------------------------------------------------------
    stage('Monitoring') {
      steps {
        sh 'docker compose -f monitoring/docker-compose.monitoring.yml up -d'
        withCredentials([string(credentialsId: 'alert-webhook-url', variable: 'WEBHOOK_URL')]) {
          sh "chmod +x monitoring/alert-on-failure.sh && monitoring/alert-on-failure.sh ${PROD_URL} \$WEBHOOK_URL"
        }
        echo 'Prometheus scraping /metrics every 15s; Alertmanager will fire BudgetMateApiDown / BudgetMateApiElevatedErrorRate per monitoring/alert.rules.yml.'
      }
    }
  }

  post {
    always {
      sh "docker rmi ${IMAGE_NAME}:${IMAGE_TAG} || true"
    }
    failure {
      echo "Pipeline failed at stage: ${env.STAGE_NAME}. See archived reports (JUnit, ESLint, npm-audit, Trivy) for detail."
    }
    success {
      echo "Pipeline succeeded end-to-end: Build -> Test -> Code Quality -> Security -> Deploy -> Release -> Monitoring."
    }
  }
}
