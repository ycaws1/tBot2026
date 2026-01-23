from pywebpush import webpush                                                                                  
import base64                                                                                                  
from cryptography.hazmat.primitives.asymmetric import ec                                                       
from cryptography.hazmat.backends import default_backend                                                       
from cryptography.hazmat.primitives import serialization                                                       
                                                                                                                
# Generate keys                                                                                                
private_key = ec.generate_private_key(ec.SECP256R1(), default_backend())                                       
public_key = private_key.public_key()                                                                          
                                                                                                                
# Export private key                                                                                           
priv_bytes = private_key.private_numbers().private_value.to_bytes(32, 'big')                                   
print('VAPID_PRIVATE_KEY=' + base64.urlsafe_b64encode(priv_bytes).decode().rstrip('='))                        
                                                                                                                
# Export public key                                                                                            
pub_bytes = public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint) 
print('VAPID_PUBLIC_KEY=' + base64.urlsafe_b64encode(pub_bytes).decode().rstrip('='))   