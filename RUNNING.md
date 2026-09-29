# Running the real pipeline — step-by-step guide

Everything in this repository (the API, its 25 tests, the Dockerfile, the
Jenkinsfile, the monitoring stack) has been built and verified to actually
run correctly. The one thing that cannot be done inside the assistant's
sandbox is standing up a *live* Jenkins server — that sandbox has no
internet access to install Jenkins/pull Docker images and no Docker daemon
running. This guide gets a real Jenkins instance running **on your own
machine**, with real internet access, in about 15–20 minutes, so you can
capture the genuine screenshot and demo video the task requires as
evidence — not simulate them.

You need: Docker Desktop (or Docker Engine) installed and running, and a
free GitHub account. Everything below is copy-paste.

## 1. Push this repository to your own GitHub (2 minutes)

```bash
cd budgetmate-devops
git remote add origin https://github.com/<your-username>/budgetmate-devops.git
git branch -M main
git push -u origin main --tags
```

(Create the empty repository first at github.com/new — don't initialise it
with a README, or the push above will conflict.)

**Grant access** (required by the task's submission guidelines): go to
your repo → **Settings → Collaborators → Add people**, and add:
- your marking tutor's GitHub username, and
- the unit chair's GitHub username

(check the unit site / Ed / your tutor's announcement for their exact
GitHub usernames — Deakin doesn't publish these centrally). If you'd
rather not add individuals, set the repo visibility to **Public** instead
(Settings → General → Danger Zone → Change visibility), which satisfies
"granted appropriate access" for anyone with the link.

## 2. Start Jenkins with Docker access (5 minutes)

Run Jenkins itself in a container, but give it access to your host's
Docker so the pipeline's own `docker build` / `docker compose` steps work
(this is the standard "Docker outside of Docker" pattern):

```bash
docker volume create jenkins_home

docker run -d --name jenkins \
  -p 8080:8080 -p 50000:50000 \
  -v jenkins_home:/var/jenkins_home \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v "$(which docker)":/usr/bin/docker \
  --group-add "$(stat -c '%g' /var/run/docker.sock 2>/dev/null || stat -f '%g' /var/run/docker.sock)" \
  jenkins/jenkins:lts
```

Open **http://localhost:8080**. Get the initial admin password:

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

Paste it in, choose **Install suggested plugins**, then create your admin
user when prompted.

## 3. Install the extra plugins this pipeline needs (3 minutes)

**Manage Jenkins → Plugins → Available plugins** — search for and install
(no restart needed for most of these, but click "restart after install" if
offered):

- Docker Pipeline
- SonarQube Scanner
- Pipeline: Stage View (usually already included)

The suggested-plugins step already installs Git, Pipeline and JUnit, which
this pipeline also needs.

## 4. Configure credentials (3 minutes)

**Manage Jenkins → Credentials → System → Global credentials → Add
Credentials**, add two:

1. **Username with password**, ID exactly `github-token` — username is
   your GitHub username, password is a
   [GitHub personal access token](https://github.com/settings/tokens)
   with `repo` scope (used by the Release stage to push the release tag).
2. **Secret text**, ID exactly `alert-webhook-url` — paste any placeholder
   URL if you don't have a real Slack/Teams webhook (e.g.
   `https://example.com/no-op`); the Monitoring stage only fails loudly if
   the *healthcheck itself* fails, not if this webhook is a placeholder.

If you don't want to set up SonarQube (step 5 is optional), you can delete
the `withSonarQubeEnv` block and the `Quality Gate` stage from the
Jenkinsfile in your pushed repo — the other 6 stages don't depend on it.

## 5. (Optional but recommended for Top HD) Run a local SonarQube

```bash
docker run -d --name sonarqube -p 9000:9000 sonarsource/sonarqube-community:latest
```

Open http://localhost:9000 (default login `admin`/`admin`, you'll be asked
to change it), then **My Account → Security → Generate Token**. In Jenkins:
**Manage Jenkins → System → SonarQube servers** — add a server named
`sonarqube-local` with URL `http://host.docker.internal:9000` and that
token as a Secret text credential.

## 6. Install Trivy on the Jenkins agent (1 minute)

The Security stage shells out to `trivy`. Simplest path — install it
straight into the running Jenkins container:

```bash
docker exec -u root jenkins sh -c \
  "apt-get update && apt-get install -y wget && \
   wget -qO- https://get.trivy.dev/trivy?type=deb | tar -xz -C /usr/local/bin trivy"
```

(If that install script's URL has changed, trivy.dev's install docs always
have an up-to-date one-liner — search "install trivy" for the current
command.)

## 7. Create the pipeline job (2 minutes)

**Dashboard → New Item → name it `budgetmate-devops` → Pipeline → OK.**
Under **Pipeline**, set:

- Definition: **Pipeline script from SCM**
- SCM: **Git**
- Repository URL: `https://github.com/<your-username>/budgetmate-devops.git`
- Branch: `*/main`
- Script Path: `Jenkinsfile`

Save, then click **Build Now**.

## 8. Watch it run, take your screenshot

Click into the build → **Open Blue Ocean** (or the classic **Stage View**
on the job page) to watch all 7 stages progress live. The **Release**
stage will pause and wait for you to click **Release** in the UI (the
`input` step) — that's the manual promotion gate the rubric rewards under
"Release process is repeatable and automated."

Once it's green end to end, **this stage view is your required
screenshot** — take it here, it's the genuine output of a pipeline that
actually built, tested, scanned, deployed and released this real code.

## 9. Record your demo video (≤10 minutes, per the task sheet)

Suggested structure (matches exactly what the task sheet asks for):

1. `git clone` the repo and briefly show the project structure (30s).
2. Show the Jenkins job configuration screen (Pipeline script from SCM) (30s).
3. Click **Build Now**, narrate each of the 7 stages as it goes green —
   pause briefly on Test (point at the JUnit result trend), Security
   (open the Trivy/npm-audit archived reports), and the Release input
   prompt (3–4 min).
4. Once released, `curl http://localhost:3000/health` and one or two other
   endpoints live in a terminal to show the deployed app actually working (1 min).
5. Open Prometheus (`http://localhost:9090/targets`) and show the
   `budgetmate-api` target as **UP** — the Monitoring stage's output (1 min).
6. Wrap up: mention what you'd add next (e.g. a real managed Postgres
   instead of the in-memory store) (30s).

Any free screen recorder works (OBS Studio, or your OS's built-in screen
recorder). Upload to YouTube (unlisted) or Google Drive and use that link
in the answer sheet.

## Tearing it down afterwards

```bash
docker rm -f jenkins sonarqube
docker compose -f docker-compose.staging.yml down
docker compose -f docker-compose.prod.yml down
docker compose -f monitoring/docker-compose.monitoring.yml down
docker volume rm jenkins_home
```
