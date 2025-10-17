# Simple handler to reflect/mirror the request right back to the caller

import json


def handle(event, context):
    if event["httpMethod"] == "POST":
        response = json.loads(event["body"])
        return respond(None, response)
    else:
        return respond(
            ValueError('Unsupported method "{}"'.format(event["httpMethod"]))
        )


def respond(err, response=None):
    return {
        "statusCode": "400" if err else "200",
        "body": err.message if err else json.dumps(response),
        "headers": {
            "Content-Type": "application/json",
        },
    }
