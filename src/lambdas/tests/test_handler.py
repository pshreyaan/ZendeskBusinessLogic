from src.lambdas.greetingService import handle


def test_handle():
    assert handle() == "Hello World"
