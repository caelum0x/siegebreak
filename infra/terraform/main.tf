terraform {
  required_providers {
    fly = { source = "fly-apps/fly" }
  }
}

# Backend services run on Fly.io at launch — deliberately not Kubernetes.
# A small team doesn't need cluster ops overhead pre-PMF. Revisit if/when
# multi-region active-active or custom autoscaling is actually needed.

variable "fly_org" {
  type = string
}

resource "fly_app" "api" {
  name = "siegebreak-api"
  org  = var.fly_org
}
